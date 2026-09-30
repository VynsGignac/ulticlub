// ============================================================
// Selection de club apres connexion : recherche, creation, et appartenance de l'utilisateur
// (table club_members). Un utilisateur peut appartenir a plusieurs clubs ; profiles.active_club_id
// indique celui affiche par defaut dans les autres onglets (voir aussi js/profile.js pour changer
// de club actif ou en quitter un).
// ============================================================

let currentPseudo = '';
let searchDebounceTimer = null;

function showClubSelect(pseudo) {
  currentPseudo = pseudo;
  document.getElementById('club-search').value = '';
  document.getElementById('club-results').innerHTML = '';
  setMessage(document.getElementById('club-select-error'), '');
  showView('view-club-select');
}

// Appelee juste apres une connexion reussie (login, reprise de session, creation/jonction/
// changement de club) : passe directement a l'app avec le club actif de l'utilisateur, ou affiche
// la selection de club s'il n'en a aucun.
async function routeAfterLogin(userId, fallbackPseudo) {
  const profile = await fetchOwnProfile(userId);
  const pseudo = profile ? profile.pseudo : fallbackPseudo;
  currentPseudo = pseudo;

  if (profile && profile.active_club_id) {
    const { data: membership } = await client
      .from('club_members')
      .select('role_encadrant, role_membre_bureau, clubs (nom)')
      .eq('user_id', userId)
      .eq('club_id', profile.active_club_id)
      .single();

    if (membership) {
      enterApp(pseudo, membership.clubs.nom, {
        encadrant: membership.role_encadrant,
        membreBureau: membership.role_membre_bureau,
      });
      return;
    }

    // Le club actif n'a plus d'appartenance correspondante (quitte depuis un autre appareil) :
    // on nettoie et on retombe sur la selection de club.
    await client.from('profiles').update({ active_club_id: null }).eq('id', userId);
  }

  showClubSelect(pseudo);
}

async function searchClubs(query) {
  const resultsEl = document.getElementById('club-results');
  const trimmed = query.trim();
  if (!trimmed) {
    resultsEl.innerHTML = '';
    return;
  }

  const { data, error } = await client
    .from('clubs')
    .select('id, nom')
    .ilike('nom', `%${trimmed}%`)
    .order('nom')
    .limit(10);

  if (error || !data.length) {
    resultsEl.innerHTML = '<li class="empty">Aucun club trouvé.</li>';
    return;
  }

  resultsEl.innerHTML = '';
  for (const club of data) {
    const li = document.createElement('li');
    li.textContent = club.nom;
    li.addEventListener('click', () => joinClub(club.id));
    resultsEl.appendChild(li);
  }
}

async function joinClub(clubId) {
  const errorEl = document.getElementById('club-select-error');
  setMessage(errorEl, '');

  try {
    const user = await requireUser();

    // Part non valide : le bureau confirme l'adhesion via "Valider membre" dans Gestion club.
    const { error: memberError } = await client
      .from('club_members')
      .insert({ user_id: user.id, club_id: clubId, role_encadrant: false, role_membre_bureau: false, valide: false });

    // 23505 = deja membre de ce club (contrainte unique user_id+club_id) : pas grave, on bascule
    // simplement dessus.
    if (memberError && memberError.code !== '23505') {
      console.error('joinClub: echec insertion club_members', memberError);
      setMessage(errorEl, `Impossible de rejoindre ce club, réessaie. (${memberError.message || memberError.code})`, true);
      return;
    }

    const { error: profileError } = await client.from('profiles').update({ active_club_id: clubId }).eq('id', user.id);
    if (profileError) {
      console.error('joinClub: echec mise a jour active_club_id', profileError);
      setMessage(errorEl, `Impossible de rejoindre ce club, réessaie. (${profileError.message || profileError.code})`, true);
      return;
    }

    await routeAfterLogin(user.id, currentPseudo);
  } catch (err) {
    // Avant ce catch, un fetch qui echoue (reseau coupe, requete bloquee...) faisait echouer cette
    // fonction en silence -- aucun message, aucune navigation, l'ecran restait fige sans indice.
    console.error('joinClub: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  }
}

async function handleClubCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const nom = document.getElementById('club-create-nom').value.trim();
  const errorEl = document.getElementById('club-create-error');
  setMessage(errorEl, '');
  submitButton.disabled = true;

  try {
    const user = await requireUser();
    const { data: club, error: createError } = await client
      .from('clubs')
      .insert({ nom, created_by: user.id })
      .select('id, nom')
      .single();

    if (createError) {
      const message = createError.code === '23505'
        ? 'Ce nom de club existe déjà.'
        : 'Erreur lors de la création du club.';
      setMessage(errorEl, message, true);
      return;
    }

    // Le createur du club est membre du bureau et encadrant en plus de joueur, des la creation,
    // et deja valide (pas besoin de se confirmer lui-meme).
    const { error: memberError } = await client
      .from('club_members')
      .insert({ user_id: user.id, club_id: club.id, role_encadrant: true, role_membre_bureau: true, valide: true });
    if (memberError) {
      console.error('handleClubCreate: echec insertion club_members', memberError);
      setMessage(errorEl, `Club créé, mais impossible de te rattacher au club. (${memberError.message || memberError.code})`, true);
      return;
    }

    const { error: profileError } = await client.from('profiles').update({ active_club_id: club.id }).eq('id', user.id);
    if (profileError) {
      console.error('handleClubCreate: echec mise a jour active_club_id', profileError);
      setMessage(errorEl, `Club créé, mais impossible de l’activer. (${profileError.message || profileError.code})`, true);
      return;
    }

    document.getElementById('club-create-form').reset();
    await routeAfterLogin(user.id, currentPseudo);
  } catch (err) {
    console.error('handleClubCreate: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('club-search').addEventListener('input', (event) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => searchClubs(event.target.value), 250);
  });

  document.getElementById('show-club-create').addEventListener('click', () => {
    setMessage(document.getElementById('club-create-error'), '');
    showView('view-club-create');
  });
  document.getElementById('show-club-select').addEventListener('click', () => {
    showClubSelect(currentPseudo);
  });
  document.getElementById('club-create-form').addEventListener('submit', handleClubCreate);
});
