// ============================================================
// Onglet Tableau de bord : sous-onglet Profil (edition des informations personnelles -- reduites
// a prenom/nom/pseudo/email, voir supabase/schema.sql --, gestion de l'appartenance aux clubs --
// recherche/creation dans js/club.js, ici un utilisateur voit tous ses clubs, peut quitter le club
// actif ou basculer vers un autre parmi ceux qu'il a deja rejoints --, et lien "ça c'est moi" vers
// la liste des membres de l'onglet Administratif) et sous-onglet Administratif (licence/dette,
// lecture seule -- rempli par le bureau ailleurs, pas encore implemente).
//
// Lien vers la liste des membres (club_licencies) : un compte peut se lier a un licencie de son
// club actif pour s'auto-identifier ("ça c'est moi"), via club_members.licencie_id. Recherche par
// nom/prenom ouverte a TOUT membre du club (via la fonction SECURITY DEFINER
// club_licencies_names(), qui n'expose jamais telephone/mail/date de naissance -- ces champs
// restent reserves au bureau). Lien actif immediatement une fois pose (pas de validation bureau
// separee ici) -- la "validation" se fait plutot en lecture ailleurs (badges "Compte lié"/"Compte
// bureau lié" dans Administratif et les listes de commission, voir js/administratif.js et
// js/club-initiatives.js).
// ============================================================

let currentProfilClubId = null;
let profilLicencieRoster = [];

function renderProfilTab() {
  selectDashboardSubTab('profil');
}

function selectDashboardSubTab(subTabId) {
  document.querySelectorAll('#tab-content-profil .subtab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.subtab === subTabId);
  });
  document.getElementById('dashboard-subtab-profil').style.display = subTabId === 'profil' ? '' : 'none';
  document.getElementById('dashboard-subtab-administratif').style.display = subTabId === 'administratif' ? '' : 'none';

  if (subTabId === 'profil') {
    renderProfilSubTab();
  } else {
    renderAdministratifSubTab();
  }
}

async function renderProfilSubTab() {
  const user = await requireUser();

  const { data: profile } = await client
    .from('profiles')
    .select('pseudo, nom, prenom, active_club_id')
    .eq('id', user.id)
    .single();

  const { data: memberships } = await client
    .from('club_members')
    .select('club_id, clubs (nom)')
    .eq('user_id', user.id);

  populateProfilForm(profile || {}, user.email);
  renderClubMemberships(profile || {}, memberships || []);

  currentProfilClubId = profile ? profile.active_club_id : null;
  await renderLicencieLinkSection(user.id);
}

function populateProfilForm(profile, email) {
  document.getElementById('profil-pseudo').value = profile.pseudo || '';
  document.getElementById('profil-prenom').value = profile.prenom || '';
  document.getElementById('profil-nom').value = profile.nom || '';
  document.getElementById('profil-email').value = email || '';

  setMessage(document.getElementById('profil-info'), '');
  setMessage(document.getElementById('profil-error'), '');
}

// --- Lien "ça c'est moi" vers la liste des membres (club_licencies) ---------------------------

async function renderLicencieLinkSection(userId) {
  const panelEl = document.getElementById('profil-licencie-panel');
  const errorEl = document.getElementById('profil-licencie-error');
  setMessage(document.getElementById('profil-licencie-info'), '');
  setMessage(errorEl, '');

  if (!currentProfilClubId) {
    panelEl.style.display = 'none';
    return;
  }
  panelEl.style.display = '';

  const [{ data: membership }, { data: roster, error: rosterError }] = await Promise.all([
    client.from('club_members').select('licencie_id').eq('user_id', userId).eq('club_id', currentProfilClubId).maybeSingle(),
    client.rpc('club_licencies_names', { target_club_id: currentProfilClubId }),
  ]);

  // Erreur la plus probable ici : le script supabase/schema.sql le plus recent n'a pas encore ete
  // execute cote Supabase (fonction club_licencies_names() inexistante) -- affichee pour pouvoir le
  // diagnostiquer depuis l'app plutot que de silencieusement retomber sur une liste vide.
  if (rosterError) {
    setMessage(errorEl, `Liste des membres indisponible (${rosterError.message}).`, true);
  }

  profilLicencieRoster = roster || [];
  const linkedId = membership ? membership.licencie_id : null;
  const linked = linkedId ? profilLicencieRoster.find((l) => l.id === linkedId) : null;

  document.getElementById('profil-licencie-linked').style.display = linked ? '' : 'none';
  document.getElementById('profil-licencie-search').style.display = linked ? 'none' : '';

  if (linked) {
    document.getElementById('profil-licencie-linked-name').textContent = [linked.prenom, linked.nom].filter(Boolean).join(' ') || linked.nom;
  }
}

// Popup (voir js/modal.js) avec un champ de recherche en haut et, en dessous, la liste deroulante
// de TOUS les licencies du club -- filtree en direct par sous-chaine commune (nom ou prenom) au fur
// et a mesure de la saisie, sans plafond de resultats affiches.
function openLicencieLinkPicker() {
  const body = showModal('Lier mon compte à un membre');
  body.innerHTML = '';

  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Chercher un nom';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Nom ou prénom...';
  searchLabel.appendChild(searchInput);
  body.appendChild(searchLabel);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  body.appendChild(listEl);

  const errorEl = document.createElement('p');
  errorEl.className = 'message error';
  body.appendChild(errorEl);

  const renderList = (query) => {
    const trimmed = query.trim().toLowerCase();
    const matches = trimmed
      ? profilLicencieRoster.filter((l) => `${l.prenom || ''} ${l.nom}`.toLowerCase().includes(trimmed))
      : profilLicencieRoster;

    listEl.innerHTML = '';
    if (!matches.length) {
      listEl.innerHTML = '<li class="empty">Aucun membre trouvé.</li>';
      return;
    }
    for (const licencie of matches) {
      const li = document.createElement('li');
      li.textContent = [licencie.prenom, licencie.nom].filter(Boolean).join(' ') || licencie.nom;
      li.addEventListener('click', () => handleLinkLicencie(licencie.id, errorEl));
      listEl.appendChild(li);
    }
  };

  searchInput.addEventListener('input', () => renderList(searchInput.value));
  renderList('');
}

async function handleLinkLicencie(licencieId, errorEl) {
  setMessage(errorEl, '');

  const { error } = await client.rpc('set_own_licencie_link', { target_club_id: currentProfilClubId, target_licencie_id: licencieId });
  if (error) {
    setMessage(errorEl, error.message || 'Erreur lors de la liaison.', true);
    return;
  }

  closeModal();
  const user = await requireUser();
  await renderLicencieLinkSection(user.id);
}

async function handleUnlinkLicencie() {
  const user = await requireUser();
  await client.rpc('set_own_licencie_link', { target_club_id: currentProfilClubId, target_licencie_id: null });
  await renderLicencieLinkSection(user.id);
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
      li.classList.toggle('highlight', isActive);
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

// Lecture seule : la licence et la dette d'un membre sont saisies par le bureau (pas encore
// implemente), pas modifiables ici. Propres au club actif (deux clubs = deux statuts distincts).
async function renderAdministratifSubTab() {
  const licenceCheckbox = document.getElementById('dashboard-licence-a-jour');
  const detteInput = document.getElementById('dashboard-dette');

  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();

  if (!profile || !profile.active_club_id) {
    licenceCheckbox.checked = false;
    detteInput.value = '';
    return;
  }

  const { data: membership } = await client
    .from('club_members')
    .select('licence_a_jour, dette')
    .eq('user_id', user.id)
    .eq('club_id', profile.active_club_id)
    .single();

  licenceCheckbox.checked = !!(membership && membership.licence_a_jour);
  detteInput.value = membership ? `${Number(membership.dette).toFixed(2)} €` : '';
}

async function leaveActiveClub(clubId, clubNom) {
  if (!confirm(`Quitter ${clubNom} ?`)) return;

  const user = await requireUser();
  await client.from('club_members').delete().eq('user_id', user.id).eq('club_id', clubId);

  const { data: remaining } = await client.from('club_members').select('club_id').eq('user_id', user.id).limit(1);
  const nextClubId = remaining && remaining.length ? remaining[0].club_id : null;
  await client.from('profiles').update({ active_club_id: nextClubId }).eq('id', user.id);

  await routeAfterLogin(user.id, currentPseudo);
}

async function switchActiveClub(clubId) {
  const user = await requireUser();
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
  };

  try {
    const user = await requireUser();
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

  document.querySelectorAll('#tab-content-profil .subtab-button').forEach((button) => {
    button.addEventListener('click', () => selectDashboardSubTab(button.dataset.subtab));
  });

  document.getElementById('profil-licencie-link-button').addEventListener('click', openLicencieLinkPicker);
  document.getElementById('profil-licencie-unlink').addEventListener('click', handleUnlinkLicencie);
});
