// ============================================================
// Onglet Gestion club (reserve aux membres du bureau) : 4 boutons, chacun ouvrant son contenu dans
// la fenetre modale partagee (voir js/modal.js).
// - Gestion membre : liste de tous les membres, filtrable (bureau / responsables d'equipe / non
//   valides). Cliquer sur un membre non valide le valide ; cliquer sur un membre valide bascule son
//   statut membre du bureau.
// - Administratif : liste de tous les membres, filtrable (sans licence a jour). Cliquer sur un
//   membre ouvre son detail pour modifier sa dette et sa licence.
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

// --- Gestion membre ------------------------------------------------
// Fusionne les anciens boutons "Gerer membre" / "Valider membre" / "Ajouter membre du bureau" en
// une seule liste filtrable.

let clubMembersFilter = 'tous';

async function fetchClubMembersWithRoles() {
  const [{ data: members }, { data: teams }] = await Promise.all([
    client.from('club_members').select('user_id, role_membre_bureau, valide').eq('club_id', currentGestionClubId),
    client.from('teams').select('id').eq('club_id', currentGestionClubId),
  ]);

  const teamIds = (teams || []).map((t) => t.id);
  let responsableIds = new Set();
  if (teamIds.length) {
    const { data: managers } = await client.from('team_managers').select('user_id').in('team_id', teamIds);
    responsableIds = new Set((managers || []).map((m) => m.user_id));
  }

  return (members || []).map((m) => ({ ...m, isResponsable: responsableIds.has(m.user_id) }));
}

// Comportement du clic : un membre non valide est valide ; un membre deja valide bascule son statut
// membre du bureau. Les deux actions etaient avant deux boutons separes.
async function handleClubMemberRowClick(member) {
  if (!member.valide) {
    await client.from('club_members').update({ valide: true }).eq('club_id', currentGestionClubId).eq('user_id', member.user_id);
  } else {
    await client.from('club_members').update({ role_membre_bureau: !member.role_membre_bureau }).eq('club_id', currentGestionClubId).eq('user_id', member.user_id);
  }
  renderClubMembersManage();
}

async function renderClubMembersManage() {
  const contentEl = showModal('Gestion membre');

  const members = await fetchClubMembersWithRoles();
  const pseudoById = await fetchPseudosByIdForClub(members.map((m) => m.user_id));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  wrapper.appendChild(buildFilterRow([
    { id: 'tous', label: 'Tous' },
    { id: 'bureau', label: 'Bureau' },
    { id: 'responsables', label: 'Responsables' },
    { id: 'non-valides', label: 'Non validés' },
  ], clubMembersFilter, (filterId) => { clubMembersFilter = filterId; renderClubMembersManage(); }));

  const filtered = members.filter((m) => {
    if (clubMembersFilter === 'bureau') return m.role_membre_bureau;
    if (clubMembersFilter === 'responsables') return m.isResponsable;
    if (clubMembersFilter === 'non-valides') return !m.valide;
    return true;
  });

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!filtered.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre pour ce filtre.</li>';
  } else {
    for (const member of filtered) {
      const tags = [];
      if (!member.valide) tags.push('non validé');
      if (member.isResponsable) tags.push('responsable');
      if (member.role_membre_bureau) tags.push('bureau');

      const li = document.createElement('li');
      li.appendChild(createMemberNameElement(member.user_id, pseudoById.get(member.user_id) || 'Inconnu'));
      if (tags.length) li.appendChild(document.createTextNode(` (${tags.join(', ')})`));
      li.classList.toggle('highlight', tags.length > 0);
      li.addEventListener('click', () => handleClubMemberRowClick(member));
      listEl.appendChild(li);
    }
  }
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

// --- Administratif ---------------------------------------------------
// Fusionne les anciens boutons "Gerer dette" / "Valider licence" : liste filtrable, le detail d'un
// membre permet de modifier les deux.

let clubAdminFilterNoLicence = false;

async function renderClubAdminList() {
  const contentEl = showModal('Administratif');

  const { data: members } = await client
    .from('club_members')
    .select('user_id, dette, licence_a_jour')
    .eq('club_id', currentGestionClubId);

  const pseudoById = await fetchPseudosByIdForClub((members || []).map((m) => m.user_id));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  wrapper.appendChild(buildFilterRow([
    { id: 'tous', label: 'Tous' },
    { id: 'sans-licence', label: 'Sans licence à jour' },
  ], clubAdminFilterNoLicence ? 'sans-licence' : 'tous', (filterId) => {
    clubAdminFilterNoLicence = filterId === 'sans-licence';
    renderClubAdminList();
  }));

  const filtered = (members || []).filter((m) => !clubAdminFilterNoLicence || !m.licence_a_jour);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!filtered.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre pour ce filtre.</li>';
  } else {
    for (const member of filtered) {
      const li = document.createElement('li');
      li.appendChild(createMemberNameElement(member.user_id, pseudoById.get(member.user_id) || 'Inconnu'));
      const detail = ` — dette : ${Number(member.dette).toFixed(2)} €` + (member.licence_a_jour ? '' : ' — licence non à jour');
      li.appendChild(document.createTextNode(detail));
      li.classList.toggle('highlight', !member.licence_a_jour);
      li.addEventListener('click', () => renderClubAdminMemberDetail(member, pseudoById.get(member.user_id)));
      listEl.appendChild(li);
    }
  }
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function renderClubAdminMemberDetail(member, pseudo) {
  const contentEl = showModal(pseudo || 'Inconnu');

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const detteLabel = document.createElement('label');
  detteLabel.textContent = 'Dette';
  const detteInput = document.createElement('input');
  detteInput.type = 'number';
  detteInput.step = '0.01';
  detteInput.value = Number(member.dette).toFixed(2);
  detteLabel.appendChild(detteInput);
  wrapper.appendChild(detteLabel);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Enregistrer la dette';
  saveButton.addEventListener('click', async () => {
    const dette = parseFloat(detteInput.value) || 0;
    await client.from('club_members').update({ dette }).eq('club_id', currentGestionClubId).eq('user_id', member.user_id);
    member.dette = dette;
    saveButton.textContent = 'Enregistré ✓';
    setTimeout(() => { saveButton.textContent = 'Enregistrer la dette'; }, 1500);
  });
  wrapper.appendChild(saveButton);

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
  wrapper.appendChild(licenceLabel);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', renderClubAdminList);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
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
// js/club-event-create.js). Cliquer sur un evenement affiche qui a confirme sa presence (si
// "demander confirmation" est coche pour cet evenement).

let clubEventsFilterBureauOnly = false;

async function renderClubEventsList() {
  const contentEl = showModal('Événement club');

  const { data: events } = await client
    .from('club_events')
    .select('id, nom, date_debut, heure_debut, lieu, demande_confirmation, bureau_uniquement')
    .eq('club_id', currentGestionClubId)
    .order('date_debut', { ascending: true });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'action-button';
  newButton.textContent = 'Nouvel événement';
  newButton.addEventListener('click', openClubEventCreate);
  wrapper.appendChild(newButton);

  wrapper.appendChild(buildFilterRow([
    { id: 'tous', label: 'Tous' },
    { id: 'bureau', label: 'Bureau uniquement' },
  ], clubEventsFilterBureauOnly ? 'bureau' : 'tous', (filterId) => {
    clubEventsFilterBureauOnly = filterId === 'bureau';
    renderClubEventsList();
  }));

  const filtered = (events || []).filter((e) => !clubEventsFilterBureauOnly || e.bureau_uniquement);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!filtered.length) {
    listEl.innerHTML = '<li class="empty">Aucun événement pour ce filtre.</li>';
  } else {
    for (const evt of filtered) {
      const li = document.createElement('li');
      const dateLabel = new Date(`${evt.date_debut}T00:00:00`).toLocaleDateString('fr-FR');
      li.textContent = `${evt.nom} — ${dateLabel}` + (evt.bureau_uniquement ? ' (bureau)' : '');
      li.addEventListener('click', () => renderClubEventDetail(evt));
      listEl.appendChild(li);
    }
  }
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

async function renderClubEventDetail(evt) {
  const contentEl = showModal(evt.nom);

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const dateLabel = new Date(`${evt.date_debut}T00:00:00`).toLocaleDateString('fr-FR');
  const meta = document.createElement('p');
  meta.className = 'communication-meta';
  meta.textContent = [dateLabel, evt.heure_debut ? evt.heure_debut.slice(0, 5) : '', evt.lieu, evt.bureau_uniquement ? 'bureau uniquement' : '']
    .filter(Boolean).join(' · ');
  wrapper.appendChild(meta);

  if (!evt.demande_confirmation) {
    const note = document.createElement('p');
    note.className = 'message';
    note.textContent = 'Cet événement ne demande pas de confirmation de présence.';
    wrapper.appendChild(note);
  } else {
    const [{ data: members }, { data: confirmations }] = await Promise.all([
      client.from('club_members').select('user_id').eq('club_id', currentGestionClubId),
      client.from('club_event_confirmations').select('user_id, present').eq('club_event_id', evt.id),
    ]);
    const pseudoById = await fetchPseudosByIdForClub((members || []).map((m) => m.user_id));
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
  backButton.addEventListener('click', renderClubEventsList);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('club-action-members-manage').addEventListener('click', renderClubMembersManage);
  document.getElementById('club-action-admin').addEventListener('click', renderClubAdminList);
  document.getElementById('club-action-create-team').addEventListener('click', renderClubTeamCreate);
  document.getElementById('club-action-events').addEventListener('click', renderClubEventsList);
});
