// ============================================================
// Detail d'une equipe (ouvert en cliquant sur une equipe depuis l'onglet "Equipe", accessible a
// tous les membres du club) : s'affiche dans la fenetre modale partagee (voir js/modal.js), jamais
// dans un nouvel onglet. Un responsable de CETTE equipe (table team_managers) voit un panneau
// d'actions (voir renderTeamActionsPanel) : gerer les membres, gerer les evenements, gerer les
// selections. Les autres membres du club n'ont que la liste des joueurs en lecture seule (voir
// openTeamMembersSplitView, branche depuis js/team-management.js selon qu'on est responsable ou
// non de l'equipe cliquee).
// ============================================================

let currentTeamId = null;
let currentTeamNom = '';
let currentTeamClubId = null;

// Appelee en cliquant sur une equipe dont on est responsable, depuis "Equipes actuelles" (voir
// js/team-management.js) : ouvre le panneau d'actions dans la fenetre modale partagee, sans
// changer d'onglet ni en creer un nouveau.
function openTeamDetail(teamId, teamNom, clubId) {
  currentTeamId = teamId;
  currentTeamNom = teamNom;
  currentTeamClubId = clubId;
  renderTeamActionsPanel();
}

function renderTeamActionsPanel() {
  const contentEl = showModal(currentTeamNom);

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const addAction = (label, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    wrapper.appendChild(button);
  };

  addAction('Gérer les membres', openTeamMembersManage);
  addAction('Événement équipe', openTeamEventsManage);
  addAction('Gérer les sélections', renderTeamSelectionsList);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

// --- Liste des joueurs (lecture seule, membres du club non responsables de CETTE equipe) --------
// Ouverte depuis l'onglet "Equipe" (voir js/team-management.js) dans la fenetre modale partagee, en
// 2 colonnes comme Gestion membre/Evenement club : liste filtrable a gauche (seul filtre : "
// Responsable"), profil + role du joueur selectionne a droite.

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

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = '‹ Retour';
  backButton.addEventListener('click', renderTeamActionsPanel);
  wrapper.appendChild(backButton);

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

// --- Evenement equipe (responsables de CETTE equipe) ---------------------------------------------
// Reutilise exactement le meme pattern qu'Evenement club (voir js/club-management.js et
// js/club-event-create.js) mais scope a l'equipe : liste a gauche / detail a droite, filtre
// "Responsables uniquement" au lieu de "Bureau uniquement", confirmations via team_event_id /
// team_members au lieu de club_event_id / club_members.

let teamEventsFilterResponsableOnly = false;
let teamEventsSelectedId = null;

function openTeamEventsManage() {
  teamEventsFilterResponsableOnly = false;
  teamEventsSelectedId = null;
  renderTeamEventsManage();
}

async function renderTeamEventsManage() {
  const contentEl = showModal(`Événements — ${currentTeamNom}`);
  contentEl.classList.add('no-scroll');

  const { data: events } = await client
    .from('team_events')
    .select('id, nom, date_debut, heure_debut, lieu, demande_confirmation, responsable_uniquement')
    .eq('team_id', currentTeamId)
    .order('date_debut', { ascending: true });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide split-view-page';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = '‹ Retour';
  backButton.addEventListener('click', renderTeamActionsPanel);
  wrapper.appendChild(backButton);

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'action-button';
  newButton.textContent = 'Nouvel événement';
  newButton.addEventListener('click', openTeamEventCreate);
  wrapper.appendChild(newButton);

  const filterRow = buildFilterRow([
    { id: 'responsables', label: 'Responsables uniquement' },
  ], teamEventsFilterResponsableOnly ? 'responsables' : null, (filterId) => {
    teamEventsFilterResponsableOnly = filterId === 'responsables';
    renderTeamEventsManage();
  });

  const filtered = (events || []).filter((e) => !teamEventsFilterResponsableOnly || e.responsable_uniquement);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!filtered.length) {
    listEl.innerHTML = '<li class="empty">Aucun événement pour ce filtre.</li>';
  } else {
    for (const evt of filtered) {
      const li = document.createElement('li');
      const dateLabel = new Date(`${evt.date_debut}T00:00:00`).toLocaleDateString('fr-FR');
      const nameEl = document.createElement('span');
      nameEl.className = 'split-view-item-name';
      nameEl.textContent = evt.nom;
      const metaEl = document.createElement('span');
      metaEl.className = 'split-view-item-meta';
      metaEl.textContent = dateLabel + (evt.responsable_uniquement ? ' · responsables' : '');
      li.appendChild(nameEl);
      li.appendChild(metaEl);
      li.classList.toggle('selected', evt.id === teamEventsSelectedId);
      li.addEventListener('click', () => {
        teamEventsSelectedId = evt.id;
        renderTeamEventsManage();
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

  const selectedEvent = filtered.find((e) => e.id === teamEventsSelectedId);
  if (selectedEvent) {
    renderTeamEventDetailInto(detailColumn, selectedEvent);
  } else {
    detailColumn.innerHTML = '<p class="split-view-detail-placeholder">Sélectionne un événement dans la liste.</p>';
  }
}

async function renderTeamEventDetailInto(container, evt) {
  container.innerHTML = '<p class="message">Chargement...</p>';

  const detail = document.createElement('div');

  const title = document.createElement('h3');
  title.className = 'split-view-detail-title';
  title.textContent = evt.nom;
  detail.appendChild(title);

  const dateLabel = new Date(`${evt.date_debut}T00:00:00`).toLocaleDateString('fr-FR');
  const meta = document.createElement('p');
  meta.className = 'communication-meta';
  meta.textContent = [dateLabel, evt.heure_debut ? evt.heure_debut.slice(0, 5) : '', evt.lieu, evt.responsable_uniquement ? 'responsables uniquement' : '']
    .filter(Boolean).join(' · ');
  detail.appendChild(meta);

  if (!evt.demande_confirmation) {
    const note = document.createElement('p');
    note.className = 'message';
    note.textContent = 'Cet événement ne demande pas de confirmation de présence.';
    detail.appendChild(note);
  } else {
    const [{ data: members }, { data: confirmations }] = await Promise.all([
      client.from('team_members').select('user_id').eq('team_id', currentTeamId),
      client.from('team_event_confirmations').select('user_id, present').eq('team_event_id', evt.id),
    ]);
    const pseudoById = await fetchPseudosById((members || []).map((m) => m.user_id));
    const responseByUser = new Map((confirmations || []).map((c) => [c.user_id, c.present]));

    const presentCount = (members || []).filter((m) => responseByUser.get(m.user_id) === true).length;
    const absentCount = (members || []).filter((m) => responseByUser.get(m.user_id) === false).length;
    const pendingCount = (members || []).length - presentCount - absentCount;

    const summary = document.createElement('p');
    summary.className = 'split-view-summary';
    summary.textContent = `Présents : ${presentCount} · Absents : ${absentCount} · Pas de réponse : ${pendingCount}`;
    detail.appendChild(summary);

    // Tri present -> absent -> pas de reponse, plutot que l'ordre arbitraire renvoye par la requete.
    const responseRank = (userId) => {
      const response = responseByUser.has(userId) ? responseByUser.get(userId) : null;
      return response === true ? 0 : response === false ? 1 : 2;
    };
    const sortedMembers = [...(members || [])].sort((a, b) => responseRank(a.user_id) - responseRank(b.user_id));

    const listEl = document.createElement('ul');
    listEl.className = 'detail-member-list';
    for (const member of sortedMembers) {
      const response = responseByUser.has(member.user_id) ? responseByUser.get(member.user_id) : null;
      const label = response === true ? 'présent' : response === false ? 'absent' : 'pas de réponse';
      const li = document.createElement('li');
      li.textContent = `${pseudoById.get(member.user_id) || 'Inconnu'} (${label})`;
      li.classList.toggle('highlight', response === true);
      li.addEventListener('click', () => openMemberProfile(member.user_id, renderTeamEventsManage));
      listEl.appendChild(li);
    }
    detail.appendChild(listEl);
  }

  container.innerHTML = '';
  container.appendChild(detail);
}

function openTeamEventCreate() {
  const contentEl = showModal('Créer un événement');
  contentEl.innerHTML = '';
  contentEl.appendChild(buildTeamEventCreateForm());
}

function buildTeamEventCreateForm() {
  const form = document.createElement('form');
  form.className = 'panel';

  const addField = (id, labelText, type, required) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.required = required;
    label.appendChild(input);
    form.appendChild(label);
    return input;
  };

  addField('team-event-nom', 'Nom de l’événement', 'text', true);
  addField('team-event-date-debut', 'Date de début', 'date', true);
  addField('team-event-date-fin', 'Date de fin (optionnel, = date de début si vide)', 'date', false);
  addField('team-event-heure-debut', 'Heure de début', 'time', true);
  addField('team-event-heure-fin', 'Heure de fin (optionnel, = heure de début si vide)', 'time', false);
  addField('team-event-lieu', 'Lieu (optionnel)', 'text', false);

  const commentLabel = document.createElement('label');
  commentLabel.textContent = 'Commentaire';
  const commentArea = document.createElement('textarea');
  commentArea.id = 'team-event-commentaire';
  commentArea.rows = 3;
  commentLabel.appendChild(commentArea);
  form.appendChild(commentLabel);

  const addCheckbox = (id, labelText) => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(labelText));
    form.appendChild(label);
    return checkbox;
  };

  const cycliqueCheckbox = addCheckbox('team-event-cyclique', 'Cyclique (toutes les semaines)');

  const derniereLabel = document.createElement('label');
  derniereLabel.id = 'team-event-derniere-occurrence-label';
  derniereLabel.style.display = 'none';
  derniereLabel.textContent = 'Date de dernière occurrence';
  const derniereInput = document.createElement('input');
  derniereInput.type = 'date';
  derniereInput.id = 'team-event-derniere-occurrence';
  derniereLabel.appendChild(derniereInput);
  form.appendChild(derniereLabel);

  cycliqueCheckbox.addEventListener('change', () => {
    derniereLabel.style.display = cycliqueCheckbox.checked ? '' : 'none';
    if (!cycliqueCheckbox.checked) derniereInput.value = '';
  });

  addCheckbox('team-event-demande-confirmation', 'Demander confirmation');
  addCheckbox('team-event-responsable-uniquement', 'Responsables uniquement');

  const infoEl = document.createElement('p');
  infoEl.id = 'team-event-create-info';
  infoEl.className = 'message';
  const errorEl = document.createElement('p');
  errorEl.id = 'team-event-create-error';
  errorEl.className = 'message error';
  form.appendChild(infoEl);
  form.appendChild(errorEl);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Créer l’événement';
  form.appendChild(submitButton);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', renderTeamEventsManage);
  form.appendChild(backButton);

  form.addEventListener('submit', handleTeamEventCreate);

  return form;
}

async function handleTeamEventCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('team-event-create-error');
  const infoEl = document.getElementById('team-event-create-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const cyclique = document.getElementById('team-event-cyclique').checked;
  const derniereOccurrence = document.getElementById('team-event-derniere-occurrence').value || null;
  if (cyclique && !derniereOccurrence) {
    setMessage(errorEl, 'Indique la date de dernière occurrence pour un événement cyclique.', true);
    return;
  }

  const dateDebut = document.getElementById('team-event-date-debut').value;
  const heureDebut = document.getElementById('team-event-heure-debut').value;

  const payload = {
    team_id: currentTeamId,
    nom: document.getElementById('team-event-nom').value.trim(),
    date_debut: dateDebut,
    date_fin: document.getElementById('team-event-date-fin').value || dateDebut,
    heure_debut: heureDebut,
    heure_fin: document.getElementById('team-event-heure-fin').value || heureDebut,
    lieu: document.getElementById('team-event-lieu').value.trim() || null,
    commentaire: document.getElementById('team-event-commentaire').value.trim() || null,
    cyclique,
    date_derniere_occurrence: cyclique ? derniereOccurrence : null,
    demande_confirmation: document.getElementById('team-event-demande-confirmation').checked,
    responsable_uniquement: document.getElementById('team-event-responsable-uniquement').checked,
  };

  submitButton.disabled = true;
  try {
    const user = await requireUser();
    const { error } = await client.from('team_events').insert({ ...payload, created_by: user.id });
    if (error) {
      setMessage(errorEl, 'Erreur lors de la création de l’événement.', true);
      return;
    }

    // Reste sur le formulaire (reinitialise) plutot que de revenir a la liste : on peut enchainer
    // la creation de plusieurs evenements sans rouvrir la fenetre a chaque fois.
    event.target.reset();
    document.getElementById('team-event-derniere-occurrence-label').style.display = 'none';
    setMessage(infoEl, 'Événement créé.');
  } catch (err) {
    console.error('handleTeamEventCreate: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
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

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = '‹ Retour';
  backButton.addEventListener('click', renderTeamActionsPanel);
  wrapper.appendChild(backButton);

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

// Pas de DOMContentLoaded ici : le panneau d'actions (voir renderTeamActionsPanel) est construit
// dynamiquement a chaque ouverture, ses boutons sont cables directement a la creation.
