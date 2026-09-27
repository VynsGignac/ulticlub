// ============================================================
// Selection de club apres connexion : recherche, creation, et memorisation du club de
// l'utilisateur (profiles.club_id). Un utilisateur appartient a un seul club a la fois.
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

// Appelee juste apres une connexion reussie (login ou reprise de session) : passe directement a
// l'app si l'utilisateur a deja un club, sinon affiche la selection de club.
async function routeAfterLogin(userId, fallbackPseudo) {
  const profile = await fetchOwnProfile(userId);
  const pseudo = profile ? profile.pseudo : fallbackPseudo;
  const roles = {
    encadrant: !!(profile && profile.role_encadrant),
    membreBureau: !!(profile && profile.role_membre_bureau),
  };

  if (profile && profile.club_id) {
    const { data: club } = await client.from('clubs').select('nom').eq('id', profile.club_id).single();
    enterApp(pseudo, club ? club.nom : '', roles);
  } else {
    showClubSelect(pseudo);
  }
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
    li.addEventListener('click', () => joinClub(club.id, club.nom));
    resultsEl.appendChild(li);
  }
}

async function joinClub(clubId, clubNom) {
  const errorEl = document.getElementById('club-select-error');
  setMessage(errorEl, '');

  const { data: { user } } = await client.auth.getUser();
  // Remet les roles a zero : ils sont propres au club quitte/rejoint, pas transferables entre clubs.
  const { error } = await client
    .from('profiles')
    .update({ club_id: clubId, role_encadrant: false, role_membre_bureau: false })
    .eq('id', user.id);
  if (error) {
    setMessage(errorEl, 'Impossible de rejoindre ce club, réessaie.', true);
    return;
  }

  enterApp(currentPseudo, clubNom, { encadrant: false, membreBureau: false });
}

async function handleClubCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const nom = document.getElementById('club-create-nom').value.trim();
  const errorEl = document.getElementById('club-create-error');
  setMessage(errorEl, '');
  submitButton.disabled = true;

  try {
    const { data: { user } } = await client.auth.getUser();
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

    // Le createur du club est membre du bureau et encadrant en plus de joueur, des la creation.
    const { error: updateError } = await client
      .from('profiles')
      .update({ club_id: club.id, role_encadrant: true, role_membre_bureau: true })
      .eq('id', user.id);
    if (updateError) {
      setMessage(errorEl, 'Club créé, mais impossible de te rattacher au club.', true);
      return;
    }

    document.getElementById('club-create-form').reset();
    enterApp(currentPseudo, club.nom, { encadrant: true, membreBureau: true });
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
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
