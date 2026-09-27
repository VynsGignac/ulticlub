// ============================================================
// Onglet de detail d'une equipe (ouvert en cliquant sur une equipe depuis "Equipes actuelles") :
// liste des membres, ajout de membres, gestion des responsables parmi les membres actuels,
// creation d'evenement (voir js/event-create.js) et creation de selection (voir
// js/selection-create.js).
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

function renderTeamDetailTab() {
  document.getElementById('team-detail-title').textContent = currentTeamNom;
  document.getElementById('team-detail-content').innerHTML = '';
}

async function fetchPseudosById(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await client.from('profiles').select('id, pseudo').in('id', userIds);
  return new Map((data || []).map((p) => [p.id, p.pseudo]));
}

async function renderTeamMembersList() {
  const contentEl = document.getElementById('team-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const [{ data: members }, { data: managers }] = await Promise.all([
    client.from('team_members').select('user_id').eq('team_id', currentTeamId),
    client.from('team_managers').select('user_id').eq('team_id', currentTeamId),
  ]);
  const managerIds = new Set((managers || []).map((m) => m.user_id));

  if (!members || !members.length) {
    contentEl.innerHTML = '<ul class="club-results"><li class="empty">Aucun membre pour l’instant.</li></ul>';
    return;
  }

  const userIds = members.map((m) => m.user_id);
  const pseudoById = await fetchPseudosById(userIds);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const userId of userIds) {
    const isManager = managerIds.has(userId);
    const li = document.createElement('li');
    li.textContent = (pseudoById.get(userId) || 'Inconnu') + (isManager ? ' (responsable)' : '');
    li.classList.toggle('highlight', isManager);
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

async function addTeamMember(userId) {
  await client.from('team_members').insert({ team_id: currentTeamId, user_id: userId });
  renderAddMembersForm();
}

async function renderAddMembersForm() {
  const contentEl = document.getElementById('team-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const [{ data: clubMembers }, { data: teamMembers }] = await Promise.all([
    client.from('club_members').select('user_id').eq('club_id', currentTeamClubId),
    client.from('team_members').select('user_id').eq('team_id', currentTeamId),
  ]);

  const teamMemberIds = new Set((teamMembers || []).map((m) => m.user_id));
  const candidateIds = (clubMembers || []).map((m) => m.user_id).filter((id) => !teamMemberIds.has(id));

  if (!candidateIds.length) {
    contentEl.innerHTML = '<p class="message">Tous les membres du club sont déjà dans l’équipe.</p>';
    return;
  }

  const pseudoById = await fetchPseudosById(candidateIds);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const userId of candidateIds) {
    const li = document.createElement('li');
    li.textContent = pseudoById.get(userId) || 'Inconnu';
    li.addEventListener('click', () => addTeamMember(userId));
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

async function toggleTeamManager(userId, isCurrentlyManager) {
  if (isCurrentlyManager) {
    await client.from('team_managers').delete().eq('team_id', currentTeamId).eq('user_id', userId);
  } else {
    await client.from('team_managers').insert({ team_id: currentTeamId, user_id: userId });
  }
  renderManageManagers();
}

// Le choix des responsables se fait parmi les membres actuels de l'equipe uniquement.
async function renderManageManagers() {
  const contentEl = document.getElementById('team-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const [{ data: members }, { data: managers }] = await Promise.all([
    client.from('team_members').select('user_id').eq('team_id', currentTeamId),
    client.from('team_managers').select('user_id').eq('team_id', currentTeamId),
  ]);
  const managerIds = new Set((managers || []).map((m) => m.user_id));

  if (!members || !members.length) {
    contentEl.innerHTML = '<p class="message">Aucun membre dans l’équipe pour l’instant.</p>';
    return;
  }

  const userIds = members.map((m) => m.user_id);
  const pseudoById = await fetchPseudosById(userIds);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const userId of userIds) {
    const isManager = managerIds.has(userId);
    const li = document.createElement('li');
    li.textContent = (pseudoById.get(userId) || 'Inconnu') + (isManager ? ' (responsable)' : '');
    li.classList.toggle('highlight', isManager);
    li.addEventListener('click', () => toggleTeamManager(userId, isManager));
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('team-action-members').addEventListener('click', renderTeamMembersList);
  document.getElementById('team-action-add-members').addEventListener('click', renderAddMembersForm);
  document.getElementById('team-action-managers').addEventListener('click', renderManageManagers);
  document.getElementById('team-action-create-event').addEventListener('click', openEventCreate);
  document.getElementById('team-action-selections').addEventListener('click', openSelectionCreate);
});
