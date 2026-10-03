// ============================================================
// Onglet Gestion club (reserve aux membres du bureau) : 3 boutons, chacun ouvrant son contenu dans
// la fenetre modale partagee (voir js/modal.js).
// - Gestion membre : fusionne les anciens ecrans "Gestion membre" et "Administratif" -- liste de
//   tous les membres, filtrable (bureau / responsables d'equipe / non valides / sans licence a
//   jour / dette superieure a X). Le volet de detail permet de valider une adhesion en attente, de
//   modifier la dette et la licence, et de basculer le statut membre du bureau.
// - Creer une equipe : le bureau choisit qui en devient responsable parmi les membres du club.
// - Evenement club : liste de tous les evenements du club, filtrable (bureau uniquement), avec un
//   bouton pour en creer un nouveau (voir js/club-event-create.js).
// "Communication" reste accessible via l'icone flottante (voir js/communications.js), plus depuis
// cet onglet -- la liste de boutons etait trop longue.
// ============================================================

let currentGestionClubId = null;
let currentGestionClubNom = '';


async function renderGestionClubTab() {
  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();

  currentGestionClubId = profile ? profile.active_club_id : null;
  currentGestionClubNom = document.getElementById('app-club').textContent || '';

  document.getElementById('club-detail-title').textContent = currentGestionClubNom;
}

async function fetchPseudosByIdForClub(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await client.from('profiles').select('id, pseudo').in('id', userIds);
  return new Map((data || []).map((p) => [p.id, p.pseudo]));
}

function buildFilterRow(filters, activeId, onSelect) {
  const filterRow = document.createElement('div');
  filterRow.className = 'filter-row';
  for (const filter of filters) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip' + (filter.id === activeId ? ' active' : '');
    chip.textContent = filter.label;
    chip.addEventListener('click', () => onSelect(filter.id));
    filterRow.appendChild(chip);
  }
  return filterRow;
}

// Regroupe un bandeau de filtres fixe (un ou plusieurs controles, ex. filter-row + un champ de
// saisie) et la liste qu'il surplombe, dans un conteneur SANS espacement entre les deux -- sinon le
// gap habituel de .panel entre ses enfants laisserait une bande transparente juste sous le bandeau,
// par laquelle la liste defilant en dessous resterait visible (voir .list-with-sticky-header dans
// index.html). Le bandeau reste fixe en haut de la fenetre modale pendant le scroll, comme une
// ligne figee.
function groupStickyList(filterElements, listEl) {
  const sticky = document.createElement('div');
  sticky.className = 'sticky-filters';
  for (const el of filterElements) sticky.appendChild(el);

  const group = document.createElement('div');
  group.className = 'list-with-sticky-header';
  group.appendChild(sticky);
  group.appendChild(listEl);
  return group;
}

// --- Gestion membre ------------------------------------------------
// Fusionne les anciens ecrans "Gestion membre" et "Administratif" en une seule liste filtrable, en
// 2 colonnes (voir Evenement club) : cliquer sur un membre affiche son profil (nom, pseudo,
// coordonnees visibles, roles), sa dette, sa licence et son statut bureau dans le volet de droite.
// Le bouton "Enregistrer" couvre dette + membre du bureau ensemble (un seul appel) ; "Valider" (pour
// une adhesion en attente) et la case "Licence à jour" restent des actions immediates, separees.

let clubMembersFilter = 'tous';
let clubMembersFilterDetteMin = null;
let clubMembersSelectedId = null;

async function fetchClubMembersWithRoles() {
  const [{ data: members }, { data: teams }] = await Promise.all([
    client.from('club_members').select('user_id, role_membre_bureau, valide, dette, licence_a_jour').eq('club_id', currentGestionClubId),
    client.from('teams').select('id, nom').eq('club_id', currentGestionClubId),
  ]);

  const teamIds = (teams || []).map((t) => t.id);
  const teamNameById = new Map((teams || []).map((t) => [t.id, t.nom]));
  const managedTeamNamesByUser = new Map();
  if (teamIds.length) {
    const { data: managers } = await client.from('team_managers').select('user_id, team_id').in('team_id', teamIds);
    for (const manager of managers || []) {
      const names = managedTeamNamesByUser.get(manager.user_id) || [];
      names.push(teamNameById.get(manager.team_id) || 'Équipe');
      managedTeamNamesByUser.set(manager.user_id, names);
    }
  }

  return (members || []).map((m) => ({
    ...m,
    isResponsable: managedTeamNamesByUser.has(m.user_id),
    managedTeamNames: managedTeamNamesByUser.get(m.user_id) || [],
  }));
}

async function renderClubMembersManage() {
  const contentEl = showModal('Gestion membre');
  contentEl.classList.add('no-scroll');

  const members = await fetchClubMembersWithRoles();
  const pseudoById = await fetchPseudosByIdForClub(members.map((m) => m.user_id));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide split-view-page';

  const filterRow = buildFilterRow([
    { id: 'tous', label: 'Tous' },
    { id: 'bureau', label: 'Bureau' },
    { id: 'responsables', label: 'Responsables' },
    { id: 'non-valides', label: 'Non validés' },
    { id: 'sans-licence', label: 'Sans licence à jour' },
  ], clubMembersFilter, (filterId) => { clubMembersFilter = filterId; renderClubMembersManage(); });

  const detteFilterWrapper = document.createElement('div');
  detteFilterWrapper.className = 'dette-filter-row';

  const detteFilterLabel = document.createElement('label');
  detteFilterLabel.textContent = 'Dette supérieure à';
  const detteFilterInput = document.createElement('input');
  detteFilterInput.type = 'number';
  detteFilterInput.step = '0.01';
  detteFilterInput.placeholder = 'Ex. 20';
  if (clubMembersFilterDetteMin !== null) detteFilterInput.value = clubMembersFilterDetteMin;
  detteFilterLabel.appendChild(detteFilterInput);

  const detteFilterToggle = document.createElement('button');
  detteFilterToggle.type = 'button';
  detteFilterToggle.className = 'action-button';
  detteFilterToggle.textContent = clubMembersFilterDetteMin !== null ? 'Désactiver' : 'Activer';
  detteFilterToggle.addEventListener('click', () => {
    if (clubMembersFilterDetteMin !== null) {
      clubMembersFilterDetteMin = null;
    } else {
      const value = parseFloat(detteFilterInput.value);
      clubMembersFilterDetteMin = Number.isFinite(value) ? value : null;
    }
    renderClubMembersManage();
  });

  detteFilterWrapper.appendChild(detteFilterLabel);
  detteFilterWrapper.appendChild(detteFilterToggle);

  const filtered = members.filter((m) => {
    if (clubMembersFilter === 'bureau' && !m.role_membre_bureau) return false;
    if (clubMembersFilter === 'responsables' && !m.isResponsable) return false;
    if (clubMembersFilter === 'non-valides' && m.valide) return false;
    if (clubMembersFilter === 'sans-licence' && m.licence_a_jour) return false;
    if (clubMembersFilterDetteMin !== null && !(Number(m.dette) > clubMembersFilterDetteMin)) return false;
    return true;
  });

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!filtered.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre pour ce filtre.</li>';
  } else {
    for (const member of filtered) {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.className = 'split-view-item-name';
      nameEl.textContent = pseudoById.get(member.user_id) || 'Inconnu';
      li.appendChild(nameEl);
      if (!member.valide) {
        const metaEl = document.createElement('span');
        metaEl.className = 'split-view-item-meta';
        metaEl.textContent = 'non validé';
        li.appendChild(metaEl);
      }
      li.classList.toggle('selected', member.user_id === clubMembersSelectedId);
      li.addEventListener('click', () => {
        clubMembersSelectedId = member.user_id;
        renderClubMembersManage();
      });
      listEl.appendChild(li);
    }
  }

  const listColumn = document.createElement('div');
  listColumn.className = 'split-view-list';
  listColumn.appendChild(groupStickyList([filterRow, detteFilterWrapper], listEl));

  const detailColumn = document.createElement('div');
  detailColumn.className = 'split-view-detail';

  const splitEl = document.createElement('div');
  splitEl.className = 'split-view';
  splitEl.appendChild(listColumn);
  splitEl.appendChild(detailColumn);
  wrapper.appendChild(splitEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);

  const selectedMember = filtered.find((m) => m.user_id === clubMembersSelectedId);
  if (selectedMember) {
    renderClubMemberDetailInto(detailColumn, selectedMember);
  } else {
    detailColumn.innerHTML = '<p class="split-view-detail-placeholder">Sélectionne un membre dans la liste.</p>';
  }
}

async function renderClubMemberDetailInto(container, member) {
  container.innerHTML = '<p class="message">Chargement...</p>';

  const { targetProfile, isBureau } = await fetchMemberProfileData(member.user_id);

  const detail = document.createElement('div');
  detail.className = 'member-detail-panel';
  detail.appendChild(buildMemberProfileFieldsEl(targetProfile, isBureau));

  // Bureau et administrateur sont aussi consideres comme des roles a part entiere, au meme titre
  // que "responsable d'equipe" -- ce dernier precise desormais la ou les equipes concernees plutot
  // qu'un simple intitule generique.
  const roleLabels = [];
  if (member.role_membre_bureau) roleLabels.push('Membre du bureau');
  if (targetProfile && targetProfile.is_admin) roleLabels.push('Administrateur');
  if (member.managedTeamNames && member.managedTeamNames.length) {
    roleLabels.push(`Responsable d’équipe (${member.managedTeamNames.join(', ')})`);
  }
  if (roleLabels.length) {
    const roleHeading = document.createElement('p');
    roleHeading.className = 'communication-meta';
    roleHeading.textContent = 'Rôle :';
    detail.appendChild(roleHeading);

    const roleList = document.createElement('ul');
    roleList.className = 'role-list';
    for (const label of roleLabels) {
      const li = document.createElement('li');
      li.textContent = label;
      roleList.appendChild(li);
    }
    detail.appendChild(roleList);
  }

  const detteLabel = document.createElement('label');
  detteLabel.textContent = 'Dette';
  const detteInput = document.createElement('input');
  detteInput.type = 'number';
  detteInput.step = '0.01';
  detteInput.value = Number(member.dette).toFixed(2);
  detteLabel.appendChild(detteInput);
  detail.appendChild(detteLabel);

  // Licence a jour reste une action immediate (comme avant), independante du bouton Enregistrer
  // ci-dessous qui ne couvre que dette + membre du bureau.
  const licenceLabel = document.createElement('label');
  licenceLabel.className = 'checkbox-label';
  const licenceCheckbox = document.createElement('input');
  licenceCheckbox.type = 'checkbox';
  licenceCheckbox.checked = !!member.licence_a_jour;
  licenceCheckbox.addEventListener('change', async () => {
    await client.from('club_members').update({ licence_a_jour: licenceCheckbox.checked }).eq('club_id', currentGestionClubId).eq('user_id', member.user_id);
    member.licence_a_jour = licenceCheckbox.checked;
  });
  licenceLabel.appendChild(licenceCheckbox);
  licenceLabel.appendChild(document.createTextNode('Licence à jour'));
  detail.appendChild(licenceLabel);

  let bureauCheckbox = null;
  if (!member.valide) {
    const validateButton = document.createElement('button');
    validateButton.type = 'button';
    validateButton.className = 'action-button';
    validateButton.textContent = 'Valider';
    validateButton.addEventListener('click', async () => {
      await client.from('club_members').update({ valide: true }).eq('club_id', currentGestionClubId).eq('user_id', member.user_id);
      renderClubMembersManage();
    });
    detail.appendChild(validateButton);
  } else {
    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'checkbox-label';
    bureauCheckbox = document.createElement('input');
    bureauCheckbox.type = 'checkbox';
    bureauCheckbox.checked = !!member.role_membre_bureau;
    checkboxLabel.appendChild(bureauCheckbox);
    checkboxLabel.appendChild(document.createTextNode('Membre du bureau'));
    detail.appendChild(checkboxLabel);
  }

  // Enregistrer couvre dette + membre du bureau ensemble (un seul appel), contrairement a la
  // licence (immediate) et a Valider (action distincte, pas une simple modification de champ).
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Enregistrer';
  saveButton.addEventListener('click', async () => {
    const dette = parseFloat(detteInput.value) || 0;
    const updates = { dette };
    if (bureauCheckbox) updates.role_membre_bureau = bureauCheckbox.checked;
    await client.from('club_members').update(updates).eq('club_id', currentGestionClubId).eq('user_id', member.user_id);
    member.dette = dette;
    if (bureauCheckbox) member.role_membre_bureau = bureauCheckbox.checked;
    saveButton.textContent = 'Enregistré ✓';
    setTimeout(() => { saveButton.textContent = 'Enregistrer'; }, 1500);
  });
  detail.appendChild(saveButton);

  container.innerHTML = '';
  container.appendChild(detail);
}

// --- Creer une equipe ------------------------------------------------
// Mêmes 4 champs structures que l'ancienne creation cote encadrant (voir js/team-management.js,
// desormais lecture seule), plus le choix du membre qui en devient responsable.

async function renderClubTeamCreate() {
  const contentEl = showModal('Créer une équipe');

  const { data: members } = await client
    .from('club_members')
    .select('user_id')
    .eq('club_id', currentGestionClubId)
    .eq('valide', true);

  const pseudoById = await fetchPseudosByIdForClub((members || []).map((m) => m.user_id));

  const form = document.createElement('form');
  form.className = 'panel';
  form.id = 'club-team-create-form';

  const buildSelect = (id, labelText, options) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const select = document.createElement('select');
    select.id = id;
    select.required = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Choisir...';
    select.appendChild(placeholder);
    for (const value of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    label.appendChild(select);
    form.appendChild(label);
    return select;
  };

  buildSelect('club-team-categorie', 'Catégorie', ['Open', 'Féminin', 'Mixte']);
  buildSelect('club-team-section', 'Section', ['Junior', 'Adulte', 'Master']);

  const divisionLabel = document.createElement('label');
  divisionLabel.textContent = 'Division';
  const divisionInput = document.createElement('input');
  divisionInput.type = 'text';
  divisionInput.id = 'club-team-division';
  divisionInput.required = true;
  divisionLabel.appendChild(divisionInput);
  form.appendChild(divisionLabel);

  buildSelect('club-team-surface', 'Surface', ['Outdoor', 'Indoor', 'Beach']);

  const respLabel = document.createElement('label');
  respLabel.textContent = 'Responsable de l’équipe';
  const respSelect = document.createElement('select');
  respSelect.id = 'club-team-responsable';
  respSelect.required = true;
  const respPlaceholder = document.createElement('option');
  respPlaceholder.value = '';
  respPlaceholder.disabled = true;
  respPlaceholder.selected = true;
  respPlaceholder.textContent = 'Choisir un membre...';
  respSelect.appendChild(respPlaceholder);
  for (const member of members || []) {
    const option = document.createElement('option');
    option.value = member.user_id;
    option.textContent = pseudoById.get(member.user_id) || 'Inconnu';
    respSelect.appendChild(option);
  }
  respLabel.appendChild(respSelect);
  form.appendChild(respLabel);

  const infoEl = document.createElement('p');
  infoEl.id = 'club-team-create-info';
  infoEl.className = 'message';
  const errorEl = document.createElement('p');
  errorEl.id = 'club-team-create-error';
  errorEl.className = 'message error';
  form.appendChild(infoEl);
  form.appendChild(errorEl);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Créer';
  form.appendChild(submitButton);

  form.addEventListener('submit', handleClubTeamCreate);

  contentEl.innerHTML = '';
  contentEl.appendChild(form);
}

async function handleClubTeamCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const categorie = document.getElementById('club-team-categorie').value;
  const section = document.getElementById('club-team-section').value;
  const division = document.getElementById('club-team-division').value.trim();
  const surface = document.getElementById('club-team-surface').value;
  const responsableId = document.getElementById('club-team-responsable').value;
  const errorEl = document.getElementById('club-team-create-error');
  const infoEl = document.getElementById('club-team-create-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');
  submitButton.disabled = true;

  try {
    const user = await requireUser();
    const { data: team, error: createError } = await client
      .from('teams')
      .insert({ categorie, section, division, surface, club_id: currentGestionClubId, created_by: user.id })
      .select('id')
      .single();

    if (createError) {
      const message = createError.code === '23505'
        ? 'Une équipe porte déjà ce nom dans ce club.'
        : 'Erreur lors de la création de l’équipe.';
      setMessage(errorEl, message, true);
      return;
    }

    const { error: memberError } = await client.from('team_members').insert({ team_id: team.id, user_id: responsableId });
    const { error: managerError } = await client.from('team_managers').insert({ team_id: team.id, user_id: responsableId });
    if (memberError || managerError) {
      setMessage(errorEl, 'Équipe créée, mais impossible de lui attribuer un responsable.', true);
      return;
    }

    document.getElementById('club-team-create-form').reset();
    setMessage(infoEl, 'Équipe créée.');
  } catch (err) {
    console.error('handleClubTeamCreate: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}

// --- Evenement club ----------------------------------------------------
// Liste de tous les evenements du club (les plus proches d'abord), filtrable sur "bureau
// uniquement". Le bouton "Nouvel événement" ouvre le formulaire de creation (voir
// js/club-event-create.js). Presentee en 2 colonnes (liste a gauche / detail de l'evenement
// selectionne a droite, voir .club-events-split dans index.html) plutot qu'en navigation
// liste -> detail -> retour : cliquer sur un evenement met juste a jour le volet de droite, sans
// changer d'ecran. Le detail affiche qui a confirme sa presence (si "demander confirmation" est
// coche pour cet evenement).

let clubEventsFilterBureauOnly = false;
let clubEventsSelectedId = null;

async function renderClubEventsList() {
  const contentEl = showModal('Événement club');
  // Les 2 colonnes (liste / detail) scrollent chacune independamment -- voir .club-events-page
  // dans index.html -- contrairement a tous les autres ecrans ou c'est #app-modal-body lui-meme
  // qui scrolle. showModal() retire cette classe par defaut a chaque ouverture ; on la rajoute ici.
  contentEl.classList.add('no-scroll');

  const { data: events } = await client
    .from('club_events')
    .select('id, nom, date_debut, heure_debut, lieu, demande_confirmation, bureau_uniquement')
    .eq('club_id', currentGestionClubId)
    .order('date_debut', { ascending: true });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide split-view-page';

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'action-button';
  newButton.textContent = 'Nouvel événement';
  newButton.addEventListener('click', openClubEventCreate);
  wrapper.appendChild(newButton);

  const filterRow = buildFilterRow([
    { id: 'tous', label: 'Tous' },
    { id: 'bureau', label: 'Bureau uniquement' },
  ], clubEventsFilterBureauOnly ? 'bureau' : 'tous', (filterId) => {
    clubEventsFilterBureauOnly = filterId === 'bureau';
    renderClubEventsList();
  });

  const filtered = (events || []).filter((e) => !clubEventsFilterBureauOnly || e.bureau_uniquement);

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
      metaEl.textContent = dateLabel + (evt.bureau_uniquement ? ' · bureau' : '');
      li.appendChild(nameEl);
      li.appendChild(metaEl);
      li.classList.toggle('selected', evt.id === clubEventsSelectedId);
      li.addEventListener('click', () => {
        clubEventsSelectedId = evt.id;
        renderClubEventsList();
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

  const selectedEvent = filtered.find((e) => e.id === clubEventsSelectedId);
  if (selectedEvent) {
    renderClubEventDetailInto(detailColumn, selectedEvent);
  } else {
    detailColumn.innerHTML = '<p class="split-view-detail-placeholder">Sélectionne un événement dans la liste.</p>';
  }
}

async function renderClubEventDetailInto(container, evt) {
  container.innerHTML = '<p class="message">Chargement...</p>';

  const detail = document.createElement('div');

  const title = document.createElement('h3');
  title.className = 'split-view-detail-title';
  title.textContent = evt.nom;
  detail.appendChild(title);

  const dateLabel = new Date(`${evt.date_debut}T00:00:00`).toLocaleDateString('fr-FR');
  const meta = document.createElement('p');
  meta.className = 'communication-meta';
  meta.textContent = [dateLabel, evt.heure_debut ? evt.heure_debut.slice(0, 5) : '', evt.lieu, evt.bureau_uniquement ? 'bureau uniquement' : '']
    .filter(Boolean).join(' · ');
  detail.appendChild(meta);

  if (!evt.demande_confirmation) {
    const note = document.createElement('p');
    note.className = 'message';
    note.textContent = 'Cet événement ne demande pas de confirmation de présence.';
    detail.appendChild(note);
  } else {
    const [{ data: members }, { data: confirmations }] = await Promise.all([
      client.from('club_members').select('user_id').eq('club_id', currentGestionClubId),
      client.from('club_event_confirmations').select('user_id, present').eq('club_event_id', evt.id),
    ]);
    const pseudoById = await fetchPseudosByIdForClub((members || []).map((m) => m.user_id));
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
      li.addEventListener('click', () => openMemberProfile(member.user_id, renderClubEventsList));
      listEl.appendChild(li);
    }
    detail.appendChild(listEl);
  }

  container.innerHTML = '';
  container.appendChild(detail);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('club-action-members-manage').addEventListener('click', renderClubMembersManage);
  document.getElementById('club-action-create-team').addEventListener('click', renderClubTeamCreate);
  document.getElementById('club-action-events').addEventListener('click', renderClubEventsList);
});
