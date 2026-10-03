// ============================================================
// Onglet de detail d'une equipe (ouvert en cliquant sur une equipe depuis l'onglet "Equipe",
// accessible a tous les membres du club) : liste des membres, ajout de membres, gestion des
// responsables parmi les membres actuels, creation d'evenement (voir js/event-create.js) et
// creation de selection (voir js/selection-create.js). Chaque action ouvre son contenu dans la
// fenetre modale partagee (voir js/modal.js) plutot que sous les boutons -- plus visible et plus
// pratique a faire defiler sur telephone qu'un contenu pousse en bas de l'ecran.
//
// Seuls les responsables de CETTE equipe (table team_managers) voient le panneau d'actions
// ci-dessous ; les autres membres du club n'ont qu'une liste en lecture seule (avec l'etiquette
// "responsable"), voir renderTeamDetailTab.
// ============================================================

let currentTeamId = null;
let currentTeamNom = '';
let currentTeamClubId = null;

// Appelee en cliquant sur une equipe dans "Equipes actuelles" : ouvre (ou reactive) un onglet
// dedie nomme d'apres l'equipe, a cote des onglets fixes.
function openTeamDetail(teamId, teamNom, clubId) {
  currentTeamId = teamId;
  currentTeamNom = teamNom;
  currentTeamClubId = clubId;

  let button = document.querySelector('#app-tabs .tab-button[data-tab="team-detail"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    button.dataset.tab = 'team-detail';
    button.addEventListener('click', () => selectTab('team-detail'));
    document.getElementById('app-tabs').appendChild(button);
  }
  button.textContent = teamNom;

  selectTab('team-detail');
}

// Determine si le joueur connecte est responsable de CETTE equipe (pas juste encadrant du club en
// general -- ce role club-wide n'existe plus, voir js/club-management.js) pour savoir si le
// panneau d'actions ou la simple liste en lecture seule doit s'afficher.
async function renderTeamDetailTab() {
  document.getElementById('team-detail-title').textContent = currentTeamNom;

  const user = await requireUser();
  const { data: manager } = await client
    .from('team_managers')
    .select('user_id')
    .eq('team_id', currentTeamId)
    .eq('user_id', user.id)
    .maybeSingle();

  const isManager = !!manager;
  document.getElementById('team-detail-actions').style.display = isManager ? '' : 'none';
  const readonlyEl = document.getElementById('team-detail-readonly');
  readonlyEl.style.display = isManager ? 'none' : '';

  if (!isManager) {
    readonlyEl.innerHTML = '<p class="message">Chargement...</p>';
    const listEl = await buildTeamMembersListEl();
    readonlyEl.innerHTML = '';
    readonlyEl.appendChild(listEl);
  }
}

// --- Liste des joueurs (lecture seule, membres du club non responsables de CETTE equipe) --------
// Ouverte depuis l'onglet "Equipe" (voir js/team-management.js) dans la fenetre modale partagee, en
// 2 colonnes comme Gestion membre/Evenement club : liste filtrable a gauche (seul filtre : "
// Responsable"), profil + role du joueur selectionne a droite. Ce que voient les responsables de
// l'equipe sera revu dans un second temps -- ils gardent pour l'instant l'ancien ecran (onglet
// dedie avec panneau d'actions, voir openTeamDetail/renderTeamDetailTab ci-dessous).

let currentSplitTeamId = null;
let currentSplitTeamNom = '';
let teamMembersFilterResponsable = false;
let teamMembersSplitSelectedId = null;

function openTeamMembersSplitView(teamId, teamNom) {
  currentSplitTeamId = teamId;
  currentSplitTeamNom = teamNom;
  teamMembersFilterResponsable = false;
  teamMembersSplitSelectedId = null;
  renderTeamMembersSplitView();
}

async function renderTeamMembersSplitView() {
  const contentEl = showModal(currentSplitTeamNom);
  contentEl.classList.add('no-scroll');

  const [{ data: members }, { data: managers }] = await Promise.all([
    client.from('team_members').select('user_id').eq('team_id', currentSplitTeamId),
    client.from('team_managers').select('user_id').eq('team_id', currentSplitTeamId),
  ]);
  const managerIds = new Set((managers || []).map((m) => m.user_id));
  const pseudoById = await fetchPseudosById((members || []).map((m) => m.user_id));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide split-view-page';

  const filterRow = buildFilterRow([
    { id: 'responsable', label: 'Responsable' },
  ], teamMembersFilterResponsable ? 'responsable' : null, (filterId) => {
    teamMembersFilterResponsable = filterId === 'responsable';
    renderTeamMembersSplitView();
  });

  const filtered = (members || []).filter((m) => !teamMembersFilterResponsable || managerIds.has(m.user_id));

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!filtered.length) {
    listEl.innerHTML = '<li class="empty">Aucun joueur pour ce filtre.</li>';
  } else {
    for (const member of filtered) {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.className = 'split-view-item-name';
      nameEl.textContent = pseudoById.get(member.user_id) || 'Inconnu';
      li.appendChild(nameEl);
      li.classList.toggle('selected', member.user_id === teamMembersSplitSelectedId);
      li.addEventListener('click', () => {
        teamMembersSplitSelectedId = member.user_id;
        renderTeamMembersSplitView();
      });
      listEl.appendChild(li);
    }
  }

  const listColumn = document.createElement('div');
  listColumn.className = 'split-view-list';
  listColumn.appendChild(groupStickyList([filterRow], listEl));

  const detailColumn = document.createElement('div');
  detailColumn.className = 'split-view-detail';

  const splitEl = document.createElement('div');
  splitEl.className = 'split-view';
  splitEl.appendChild(listColumn);
  splitEl.appendChild(detailColumn);
  wrapper.appendChild(splitEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);

  const selectedMember = (members || []).find((m) => m.user_id === teamMembersSplitSelectedId);
  if (selectedMember) {
    renderTeamMemberSplitDetailInto(detailColumn, selectedMember.user_id);
  } else {
    detailColumn.innerHTML = '<p class="split-view-detail-placeholder">Sélectionne un joueur dans la liste.</p>';
  }
}

async function renderTeamMemberSplitDetailInto(container, userId) {
  container.innerHTML = '<p class="message">Chargement...</p>';

  // fetchMemberProfileData calcule les roles (bureau, administrateur, responsable -- avec la ou
  // les equipes concernees) dans le club actif du viewer, pas seulement pour CETTE equipe : memes
  // informations qu'ailleurs dans l'app (Gestion membre, fiche profil), comme demande.
  const { targetProfile, isBureau, roleLabels } = await fetchMemberProfileData(userId);

  const detail = document.createElement('div');
  detail.className = 'profile-detail-panel';
  detail.appendChild(buildMemberProfileFieldsEl(targetProfile, isBureau));
  appendRoleListEl(detail, roleLabels);

  container.innerHTML = '';
  container.appendChild(detail);
}

async function fetchPseudosById(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await client.from('profiles').select('id, pseudo').in('id', userIds);
  return new Map((data || []).map((p) => [p.id, p.pseudo]));
}

// Partagee entre la liste en lecture seule (membres non-responsables) et le bouton "Afficher la
// liste des membres" du panneau d'actions (responsables) -- meme contenu, deux points d'entree.
async function buildTeamMembersListEl() {
  const [{ data: members }, { data: managers }] = await Promise.all([
    client.from('team_members').select('user_id').eq('team_id', currentTeamId),
    client.from('team_managers').select('user_id').eq('team_id', currentTeamId),
  ]);
  const managerIds = new Set((managers || []).map((m) => m.user_id));

  if (!members || !members.length) {
    const listEl = document.createElement('ul');
    listEl.className = 'club-results';
    listEl.innerHTML = '<li class="empty">Aucun membre pour l’instant.</li>';
    return listEl;
  }

  const userIds = members.map((m) => m.user_id);
  const pseudoById = await fetchPseudosById(userIds);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const userId of userIds) {
    const isManager = managerIds.has(userId);
    const li = document.createElement('li');
    li.appendChild(createMemberNameElement(userId, pseudoById.get(userId) || 'Inconnu'));
    if (isManager) li.appendChild(document.createTextNode(' (responsable)'));
    li.classList.toggle('highlight', isManager);
    listEl.appendChild(li);
  }
  return listEl;
}

// --- Gerer les membres (responsables de CETTE equipe) -------------------------------------------
// Fusionne les anciens ecrans "Afficher la liste des membres"/"Ajouter des membres"/"Gerer les
// responsables" en une seule liste filtrable, en 2 colonnes (meme pattern que partout ailleurs
// dans l'app) : regroupe les membres actuels de l'equipe ET les candidats en attente de selection
// (toutes les selections de l'equipe confondues, peu importe la date limite). Filtres : "
// Responsable" et "En sélection". Le volet de detail du joueur selectionne propose "Nommer
// co-responsable"/"Retirer des co-responsables" (bascule team_managers) et "Sélectionner"/"Retirer
// de la sélection" (bascule team_members -- "Selectionner" accepte un candidat comme joueur de
// l'equipe). Ajouter un membre totalement nouveau (ni dans l'equipe, ni candidat) se fait via le
// bouton "Ajouter un membre" ci-dessous, qui reutilise renderAddMembersForm plus bas.

let teamManageFilter = null;
let teamManageSelectedId = null;

function openTeamMembersManage() {
  teamManageFilter = null;
  teamManageSelectedId = null;
  renderTeamMembersManage();
}

async function renderTeamMembersManage() {
  const contentEl = showModal('Gérer les membres');
  contentEl.classList.add('no-scroll');

  const [{ data: members }, { data: managers }, { data: selections }] = await Promise.all([
    client.from('team_members').select('user_id').eq('team_id', currentTeamId),
    client.from('team_managers').select('user_id').eq('team_id', currentTeamId),
    client.from('team_selections').select('id').eq('team_id', currentTeamId),
  ]);

  const memberIds = new Set((members || []).map((m) => m.user_id));
  const managerIds = new Set((managers || []).map((m) => m.user_id));

  const selectionIds = (selections || []).map((s) => s.id);
  let candidateIds = new Set();
  if (selectionIds.length) {
    const { data: candidatures } = await client.from('team_selection_candidatures').select('user_id').in('selection_id', selectionIds);
    candidateIds = new Set((candidatures || []).map((c) => c.user_id));
  }

  const allIds = [...new Set([...memberIds, ...candidateIds])];
  const pseudoById = await fetchPseudosById(allIds);

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide split-view-page';

  const newMemberButton = document.createElement('button');
  newMemberButton.type = 'button';
  newMemberButton.className = 'action-button';
  newMemberButton.textContent = 'Ajouter un membre';
  newMemberButton.addEventListener('click', renderAddMembersForm);
  wrapper.appendChild(newMemberButton);

  const filterRow = buildFilterRow([
    { id: 'responsable', label: 'Responsable' },
    { id: 'selection', label: 'En sélection' },
  ], teamManageFilter, (filterId) => { teamManageFilter = filterId; renderTeamMembersManage(); });

  const filtered = allIds.filter((id) => {
    if (teamManageFilter === 'responsable') return managerIds.has(id);
    if (teamManageFilter === 'selection') return candidateIds.has(id);
    return true;
  });

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!filtered.length) {
    listEl.innerHTML = '<li class="empty">Aucun joueur pour ce filtre.</li>';
  } else {
    for (const userId of filtered) {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.className = 'split-view-item-name';
      nameEl.textContent = pseudoById.get(userId) || 'Inconnu';
      li.appendChild(nameEl);
      li.classList.toggle('selected', userId === teamManageSelectedId);
      li.addEventListener('click', () => {
        teamManageSelectedId = userId;
        renderTeamMembersManage();
      });
      listEl.appendChild(li);
    }
  }

  const listColumn = document.createElement('div');
  listColumn.className = 'split-view-list';
  listColumn.appendChild(groupStickyList([filterRow], listEl));

  const detailColumn = document.createElement('div');
  detailColumn.className = 'split-view-detail';

  const splitEl = document.createElement('div');
  splitEl.className = 'split-view';
  splitEl.appendChild(listColumn);
  splitEl.appendChild(detailColumn);
  wrapper.appendChild(splitEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);

  if (teamManageSelectedId && allIds.includes(teamManageSelectedId)) {
    renderTeamManageDetailInto(detailColumn, teamManageSelectedId, {
      isManager: managerIds.has(teamManageSelectedId),
      isMember: memberIds.has(teamManageSelectedId),
    });
  } else {
    detailColumn.innerHTML = '<p class="split-view-detail-placeholder">Sélectionne un joueur dans la liste.</p>';
  }
}

async function renderTeamManageDetailInto(container, userId, { isManager, isMember }) {
  container.innerHTML = '<p class="message">Chargement...</p>';

  const { targetProfile, isBureau, roleLabels } = await fetchMemberProfileData(userId);

  const detail = document.createElement('div');
  detail.className = 'member-detail-panel';
  detail.appendChild(buildMemberProfileFieldsEl(targetProfile, isBureau));
  appendRoleListEl(detail, roleLabels);

  const managerButton = document.createElement('button');
  managerButton.type = 'button';
  managerButton.className = 'action-button';
  managerButton.textContent = isManager ? 'Retirer des co-responsables' : 'Nommer co-responsable';
  managerButton.addEventListener('click', async () => {
    if (isManager) {
      await client.from('team_managers').delete().eq('team_id', currentTeamId).eq('user_id', userId);
    } else {
      await client.from('team_managers').insert({ team_id: currentTeamId, user_id: userId });
    }
    renderTeamMembersManage();
  });
  detail.appendChild(managerButton);

  const memberButton = document.createElement('button');
  memberButton.type = 'button';
  memberButton.className = 'action-button';
  memberButton.textContent = isMember ? 'Retirer de la sélection' : 'Sélectionner';
  memberButton.addEventListener('click', async () => {
    if (isMember) {
      await client.from('team_members').delete().eq('team_id', currentTeamId).eq('user_id', userId);
    } else {
      await client.from('team_members').insert({ team_id: currentTeamId, user_id: userId });
    }
    renderTeamMembersManage();
  });
  detail.appendChild(memberButton);

  container.innerHTML = '';
  container.appendChild(detail);
}

async function addTeamMember(userId) {
  await client.from('team_members').insert({ team_id: currentTeamId, user_id: userId });
  renderAddMembersForm();
}

async function renderAddMembersForm() {
  const contentEl = showModal('Ajouter un membre');

  const [{ data: clubMembers }, { data: teamMembers }] = await Promise.all([
    client.from('club_members').select('user_id').eq('club_id', currentTeamClubId),
    client.from('team_members').select('user_id').eq('team_id', currentTeamId),
  ]);

  const teamMemberIds = new Set((teamMembers || []).map((m) => m.user_id));
  const candidateIds = (clubMembers || []).map((m) => m.user_id).filter((id) => !teamMemberIds.has(id));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  if (!candidateIds.length) {
    const message = document.createElement('p');
    message.className = 'message';
    message.textContent = 'Tous les membres du club sont déjà dans l’équipe.';
    wrapper.appendChild(message);
  } else {
    const pseudoById = await fetchPseudosById(candidateIds);

    const listEl = document.createElement('ul');
    listEl.className = 'club-results';
    for (const userId of candidateIds) {
      const li = document.createElement('li');
      li.appendChild(createMemberNameElement(userId, pseudoById.get(userId) || 'Inconnu'));
      li.addEventListener('click', () => addTeamMember(userId));
      listEl.appendChild(li);
    }
    wrapper.appendChild(listEl);
  }

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', renderTeamMembersManage);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

// Liste des evenements de l'equipe (les plus proches d'abord) : cliquer sur l'un d'eux affiche qui
// a confirme sa presence (uniquement si "demander confirmation" est coche pour cet evenement).
async function renderTeamEventsList() {
  const contentEl = showModal('Événements de l’équipe');

  const { data: events } = await client
    .from('team_events')
    .select('id, nom, date_debut, heure_debut, lieu, demande_confirmation')
    .eq('team_id', currentTeamId)
    .order('date_debut', { ascending: true });

  if (!events || !events.length) {
    contentEl.innerHTML = '<p class="message">Aucun événement pour l’instant.</p>';
    return;
  }

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const evt of events) {
    const li = document.createElement('li');
    const dateLabel = new Date(`${evt.date_debut}T00:00:00`).toLocaleDateString('fr-FR');
    li.textContent = `${evt.nom} — ${dateLabel}`;
    li.addEventListener('click', () => renderTeamEventDetail(evt));
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

async function renderTeamEventDetail(evt) {
  const contentEl = showModal(evt.nom);

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const dateLabel = new Date(`${evt.date_debut}T00:00:00`).toLocaleDateString('fr-FR');
  const meta = document.createElement('p');
  meta.className = 'communication-meta';
  meta.textContent = [dateLabel, evt.heure_debut ? evt.heure_debut.slice(0, 5) : '', evt.lieu].filter(Boolean).join(' · ');
  wrapper.appendChild(meta);

  if (!evt.demande_confirmation) {
    const note = document.createElement('p');
    note.className = 'message';
    note.textContent = 'Cet événement ne demande pas de confirmation de présence.';
    wrapper.appendChild(note);
  } else {
    const [{ data: members }, { data: confirmations }] = await Promise.all([
      client.from('team_members').select('user_id').eq('team_id', currentTeamId),
      client.from('team_event_confirmations').select('user_id, present').eq('team_event_id', evt.id),
    ]);
    const pseudoById = await fetchPseudosById((members || []).map((m) => m.user_id));
    const responseByUser = new Map((confirmations || []).map((c) => [c.user_id, c.present]));

    const listEl = document.createElement('ul');
    listEl.className = 'club-results';
    for (const member of members || []) {
      const response = responseByUser.has(member.user_id) ? responseByUser.get(member.user_id) : null;
      const label = response === true ? 'présent' : response === false ? 'absent' : 'en attente';
      const li = document.createElement('li');
      li.appendChild(createMemberNameElement(member.user_id, pseudoById.get(member.user_id) || 'Inconnu'));
      li.appendChild(document.createTextNode(` (${label})`));
      li.classList.toggle('highlight', response === true);
      listEl.appendChild(li);
    }
    wrapper.appendChild(listEl);
  }

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', renderTeamEventsList);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

// Liste des selections de l'equipe : "Nouvelle sélection" ouvre le formulaire de creation (voir
// js/selection-create.js) ; cliquer sur une selection existante affiche la liste des candidats.
async function renderTeamSelectionsList() {
  const contentEl = showModal('Sélections de l’équipe');

  const { data: selections } = await client
    .from('team_selections')
    .select('id, date_limite_candidature, commentaire')
    .eq('team_id', currentTeamId)
    .order('date_limite_candidature', { ascending: true });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'action-button';
  newButton.textContent = 'Nouvelle sélection';
  newButton.addEventListener('click', openSelectionCreate);
  wrapper.appendChild(newButton);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!selections || !selections.length) {
    listEl.innerHTML = '<li class="empty">Aucune sélection pour l’instant.</li>';
  } else {
    for (const sel of selections) {
      const li = document.createElement('li');
      const dateLabel = new Date(`${sel.date_limite_candidature}T00:00:00`).toLocaleDateString('fr-FR');
      li.textContent = `Candidature avant le ${dateLabel}`;
      li.addEventListener('click', () => renderTeamSelectionDetail(sel));
      listEl.appendChild(li);
    }
  }
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

async function renderTeamSelectionDetail(sel) {
  const dateLabel = new Date(`${sel.date_limite_candidature}T00:00:00`).toLocaleDateString('fr-FR');
  const contentEl = showModal(`Candidature avant le ${dateLabel}`);

  const { data: candidatures } = await client
    .from('team_selection_candidatures')
    .select('user_id')
    .eq('selection_id', sel.id);

  const pseudoById = await fetchPseudosById((candidatures || []).map((c) => c.user_id));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  if (sel.commentaire) {
    const comment = document.createElement('p');
    comment.className = 'communication-body';
    comment.textContent = sel.commentaire;
    wrapper.appendChild(comment);
  }

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!candidatures || !candidatures.length) {
    listEl.innerHTML = '<li class="empty">Aucun candidat pour l’instant.</li>';
  } else {
    for (const c of candidatures) {
      const li = document.createElement('li');
      li.appendChild(createMemberNameElement(c.user_id, pseudoById.get(c.user_id) || 'Inconnu'));
      listEl.appendChild(li);
    }
  }
  wrapper.appendChild(listEl);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', renderTeamSelectionsList);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('team-action-manage-members').addEventListener('click', openTeamMembersManage);
  document.getElementById('team-action-create-event').addEventListener('click', openEventCreate);
  document.getElementById('team-action-view-events').addEventListener('click', renderTeamEventsList);
  document.getElementById('team-action-selections').addEventListener('click', renderTeamSelectionsList);
});
