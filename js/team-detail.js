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

// Liste des evenements de l'equipe (les plus proches d'abord) : cliquer sur l'un d'eux affiche qui
// a confirme sa presence (uniquement si "demander confirmation" est coche pour cet evenement).
async function renderTeamEventsList() {
  const contentEl = document.getElementById('team-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

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
  const contentEl = document.getElementById('team-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const title = document.createElement('h2');
  title.textContent = evt.nom;
  wrapper.appendChild(title);

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
      li.textContent = `${pseudoById.get(member.user_id) || 'Inconnu'} (${label})`;
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
  const contentEl = document.getElementById('team-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

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
  const contentEl = document.getElementById('team-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const { data: candidatures } = await client
    .from('team_selection_candidatures')
    .select('user_id')
    .eq('selection_id', sel.id);

  const pseudoById = await fetchPseudosById((candidatures || []).map((c) => c.user_id));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const dateLabel = new Date(`${sel.date_limite_candidature}T00:00:00`).toLocaleDateString('fr-FR');
  const title = document.createElement('h2');
  title.textContent = `Candidature avant le ${dateLabel}`;
  wrapper.appendChild(title);

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
      li.textContent = pseudoById.get(c.user_id) || 'Inconnu';
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
  document.getElementById('team-action-members').addEventListener('click', renderTeamMembersList);
  document.getElementById('team-action-add-members').addEventListener('click', renderAddMembersForm);
  document.getElementById('team-action-managers').addEventListener('click', renderManageManagers);
  document.getElementById('team-action-create-event').addEventListener('click', openEventCreate);
  document.getElementById('team-action-view-events').addEventListener('click', renderTeamEventsList);
  document.getElementById('team-action-selections').addEventListener('click', renderTeamSelectionsList);
});
