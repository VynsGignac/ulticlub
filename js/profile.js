// ============================================================
// Onglet Profil : edition des informations personnelles, et gestion de l'appartenance aux clubs
// (recherche/creation dans js/club.js ; ici, un utilisateur voit tous ses clubs, peut quitter le
// club actif ou basculer vers un autre parmi ceux qu'il a deja rejoints).
// ============================================================

async function renderProfilTab() {
  const { data: { user } } = await client.auth.getUser();

  const { data: profile } = await client
    .from('profiles')
    .select('pseudo, nom, prenom, telephone, adresse, date_naissance, active_club_id')
    .eq('id', user.id)
    .single();

  const { data: memberships } = await client
    .from('club_members')
    .select('club_id, clubs (nom)')
    .eq('user_id', user.id);

  populateProfilForm(profile || {});
  renderClubMemberships(profile || {}, memberships || []);
}

function populateProfilForm(profile) {
  document.getElementById('profil-pseudo').value = profile.pseudo || '';
  document.getElementById('profil-prenom').value = profile.prenom || '';
  document.getElementById('profil-nom').value = profile.nom || '';
  document.getElementById('profil-telephone').value = profile.telephone || '';
  document.getElementById('profil-adresse').value = profile.adresse || '';
  document.getElementById('profil-date-naissance').value = profile.date_naissance || '';
  setMessage(document.getElementById('profil-info'), '');
  setMessage(document.getElementById('profil-error'), '');
}

function renderClubMemberships(profile, memberships) {
  const listEl = document.getElementById('profil-club-list');
  const activeClubId = profile.active_club_id;
  listEl.innerHTML = '';

  if (!memberships.length) {
    listEl.innerHTML = '<li class="empty">Tu n’appartiens à aucun club pour l’instant.</li>';
  } else {
    for (const membership of memberships) {
      const li = document.createElement('li');
      const isActive = membership.club_id === activeClubId;
      li.textContent = membership.clubs.nom + (isActive ? ' (actuel)' : '');
      li.classList.toggle('active-club', isActive);
      listEl.appendChild(li);
    }
  }

  const activeMembership = memberships.find((m) => m.club_id === activeClubId);
  const leaveButton = document.getElementById('profil-leave-club');
  if (activeMembership) {
    leaveButton.textContent = `Quitter ${activeMembership.clubs.nom}`;
    leaveButton.style.display = '';
    leaveButton.onclick = () => leaveActiveClub(activeClubId, activeMembership.clubs.nom);
  } else {
    leaveButton.style.display = 'none';
  }

  const otherMemberships = memberships.filter((m) => m.club_id !== activeClubId);
  const switchButton = document.getElementById('profil-switch-club');
  const switchList = document.getElementById('profil-switch-list');
  switchList.style.display = 'none';
  switchList.innerHTML = '';

  if (!otherMemberships.length) {
    switchButton.style.display = 'none';
  } else {
    switchButton.style.display = '';
    switchButton.onclick = () => {
      const isShowing = switchList.style.display !== 'none';
      if (isShowing) {
        switchList.style.display = 'none';
        return;
      }
      switchList.innerHTML = '';
      for (const membership of otherMemberships) {
        const li = document.createElement('li');
        li.textContent = membership.clubs.nom;
        li.addEventListener('click', () => switchActiveClub(membership.club_id));
        switchList.appendChild(li);
      }
      switchList.style.display = '';
    };
  }
}

async function leaveActiveClub(clubId, clubNom) {
  if (!confirm(`Quitter ${clubNom} ?`)) return;

  const { data: { user } } = await client.auth.getUser();
  await client.from('club_members').delete().eq('user_id', user.id).eq('club_id', clubId);

  const { data: remaining } = await client.from('club_members').select('club_id').eq('user_id', user.id).limit(1);
  const nextClubId = remaining && remaining.length ? remaining[0].club_id : null;
  await client.from('profiles').update({ active_club_id: nextClubId }).eq('id', user.id);

  await routeAfterLogin(user.id, currentPseudo);
}

async function switchActiveClub(clubId) {
  const { data: { user } } = await client.auth.getUser();
  await client.from('profiles').update({ active_club_id: clubId }).eq('id', user.id);
  await routeAfterLogin(user.id, currentPseudo);
}

async function handleProfilSave(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('profil-error');
  const infoEl = document.getElementById('profil-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');
  submitButton.disabled = true;

  const updates = {
    pseudo: document.getElementById('profil-pseudo').value.trim(),
    nom: document.getElementById('profil-nom').value.trim(),
    prenom: document.getElementById('profil-prenom').value.trim() || null,
    telephone: document.getElementById('profil-telephone').value.trim() || null,
    adresse: document.getElementById('profil-adresse').value.trim() || null,
    date_naissance: document.getElementById('profil-date-naissance').value || null,
  };

  try {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('profiles').update(updates).eq('id', user.id);
    if (error) {
      const message = error.code === '23505'
        ? 'Ce pseudo est déjà utilisé.'
        : 'Erreur lors de l’enregistrement.';
      setMessage(errorEl, message, true);
      return;
    }

    currentPseudo = updates.pseudo;
    document.getElementById('app-pseudo').textContent = updates.pseudo;
    setMessage(infoEl, 'Profil enregistré.');
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('profil-form').addEventListener('submit', handleProfilSave);
});
