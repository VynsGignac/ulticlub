// ============================================================
// Onglet Gestion club (reserve aux membres du bureau) : equivalent du detail d'equipe mais a
// l'echelle de tout le club actif au lieu d'une seule equipe.
// - Gerer membre (etait "Afficher la liste des membres") : liste tous les membres du club.
// - Valider membre (etait "Ajouter des membres") : confirme les membres qui ont rejoint le club
//   via la recherche (partis "non valides", voir js/club.js) -- pas d'ajout direct d'un nouvel
//   utilisateur, juste la validation de ceux qui ont deja demande a rejoindre.
// - Gerer les responsables : bascule le role encadrant parmi les membres du club.
// - Ajouter membre du bureau : bascule le role membre du bureau parmi les membres du club.
// - Creer un evenement : ouvre un onglet dedie (voir js/club-event-create.js), visible dans le
//   calendrier de tout le club au lieu d'une seule equipe.
// - Gerer dette : liste tous les membres avec leur dette, modifiable en ligne, un bouton flottant
//   en bas de l'ecran valide toutes les modifications en une fois.
// - Communication : ouvre le meme panneau que l'icone flottante "communications", visible dans
//   tous les onglets (voir js/communications.js).
// Pas d'equivalent a "Gerer les selections" : ca n'a pas de sens a l'echelle du club entier.
// ============================================================

let currentGestionClubId = null;
let currentGestionClubNom = '';

function hideClubDebtSaveButton() {
  document.getElementById('club-debt-save-button').style.display = 'none';
}

async function renderGestionClubTab() {
  const { data: { user } } = await client.auth.getUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();

  currentGestionClubId = profile ? profile.active_club_id : null;
  currentGestionClubNom = document.getElementById('app-club').textContent || '';

  document.getElementById('club-detail-title').textContent = currentGestionClubNom;
  document.getElementById('club-detail-content').innerHTML = '';
  hideClubDebtSaveButton();
}

async function fetchPseudosByIdForClub(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await client.from('profiles').select('id, pseudo').in('id', userIds);
  return new Map((data || []).map((p) => [p.id, p.pseudo]));
}

async function renderClubMembersList() {
  hideClubDebtSaveButton();
  const contentEl = document.getElementById('club-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const { data: members } = await client
    .from('club_members')
    .select('user_id, role_encadrant, role_membre_bureau, valide')
    .eq('club_id', currentGestionClubId);

  if (!members || !members.length) {
    contentEl.innerHTML = '<ul class="club-results"><li class="empty">Aucun membre pour l’instant.</li></ul>';
    return;
  }

  const pseudoById = await fetchPseudosByIdForClub(members.map((m) => m.user_id));

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const member of members) {
    const tags = [];
    if (!member.valide) tags.push('non validé');
    if (member.role_encadrant) tags.push('encadrant');
    if (member.role_membre_bureau) tags.push('bureau');

    const li = document.createElement('li');
    li.textContent = (pseudoById.get(member.user_id) || 'Inconnu') + (tags.length ? ` (${tags.join(', ')})` : '');
    li.classList.toggle('highlight', tags.length > 0);
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

async function validateMember(userId) {
  await client.from('club_members').update({ valide: true }).eq('club_id', currentGestionClubId).eq('user_id', userId);
  renderValidateMembers();
}

async function renderValidateMembers() {
  hideClubDebtSaveButton();
  const contentEl = document.getElementById('club-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const { data: pending } = await client
    .from('club_members')
    .select('user_id')
    .eq('club_id', currentGestionClubId)
    .eq('valide', false);

  if (!pending || !pending.length) {
    contentEl.innerHTML = '<p class="message">Aucun membre en attente de validation.</p>';
    return;
  }

  const pseudoById = await fetchPseudosByIdForClub(pending.map((m) => m.user_id));

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const member of pending) {
    const li = document.createElement('li');
    li.textContent = pseudoById.get(member.user_id) || 'Inconnu';
    li.addEventListener('click', () => validateMember(member.user_id));
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

async function toggleClubRole(userId, field, isCurrentlyOn, rerender) {
  await client.from('club_members').update({ [field]: !isCurrentlyOn }).eq('club_id', currentGestionClubId).eq('user_id', userId);
  rerender();
}

async function renderClubRoleToggle(field, tagLabel, rerender) {
  hideClubDebtSaveButton();
  const contentEl = document.getElementById('club-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const { data: members } = await client
    .from('club_members')
    .select(`user_id, ${field}`)
    .eq('club_id', currentGestionClubId);

  if (!members || !members.length) {
    contentEl.innerHTML = '<p class="message">Aucun membre pour l’instant.</p>';
    return;
  }

  const pseudoById = await fetchPseudosByIdForClub(members.map((m) => m.user_id));

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const member of members) {
    const isOn = !!member[field];
    const li = document.createElement('li');
    li.textContent = (pseudoById.get(member.user_id) || 'Inconnu') + (isOn ? ` (${tagLabel})` : '');
    li.classList.toggle('highlight', isOn);
    li.addEventListener('click', () => toggleClubRole(member.user_id, field, isOn, rerender));
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

function renderManageClubEncadrants() {
  renderClubRoleToggle('role_encadrant', 'encadrant', renderManageClubEncadrants);
}

function renderAddBureauMembers() {
  renderClubRoleToggle('role_membre_bureau', 'bureau', renderAddBureauMembers);
}

async function renderClubManageDebt() {
  hideClubDebtSaveButton();
  const contentEl = document.getElementById('club-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const { data: members } = await client
    .from('club_members')
    .select('user_id, dette')
    .eq('club_id', currentGestionClubId);

  if (!members || !members.length) {
    contentEl.innerHTML = '<p class="message">Aucun membre pour l’instant.</p>';
    return;
  }

  const pseudoById = await fetchPseudosByIdForClub(members.map((m) => m.user_id));

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const member of members) {
    const li = document.createElement('li');
    li.className = 'debt-row';

    const label = document.createElement('span');
    label.textContent = pseudoById.get(member.user_id) || 'Inconnu';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = Number(member.dette).toFixed(2);
    input.dataset.userId = member.user_id;

    li.appendChild(label);
    li.appendChild(input);
    listEl.appendChild(li);
  }

  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
  document.getElementById('club-debt-save-button').style.display = '';
}

async function saveClubDebts() {
  const saveButton = document.getElementById('club-debt-save-button');
  const inputs = document.querySelectorAll('#club-detail-content .debt-row input');
  saveButton.disabled = true;

  await Promise.all(Array.from(inputs).map((input) => client
    .from('club_members')
    .update({ dette: parseFloat(input.value) || 0 })
    .eq('club_id', currentGestionClubId)
    .eq('user_id', input.dataset.userId)));

  saveButton.disabled = false;
  saveButton.textContent = 'Enregistré ✓';
  setTimeout(() => { saveButton.textContent = 'Valider'; }, 1500);
}

// Liste des evenements du club (les plus proches d'abord) : cliquer sur l'un d'eux affiche qui a
// confirme sa presence (uniquement si "demander confirmation" est coche pour cet evenement).
async function renderClubEventsList() {
  hideClubDebtSaveButton();
  const contentEl = document.getElementById('club-detail-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const { data: events } = await client
    .from('club_events')
    .select('id, nom, date_debut, heure_debut, lieu, demande_confirmation')
    .eq('club_id', currentGestionClubId)
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
    li.addEventListener('click', () => renderClubEventDetail(evt));
    listEl.appendChild(li);
  }
  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

async function renderClubEventDetail(evt) {
  hideClubDebtSaveButton();
  const contentEl = document.getElementById('club-detail-content');
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
  backButton.addEventListener('click', renderClubEventsList);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('club-action-members').addEventListener('click', renderClubMembersList);
  document.getElementById('club-action-validate-members').addEventListener('click', renderValidateMembers);
  document.getElementById('club-action-managers').addEventListener('click', renderManageClubEncadrants);
  document.getElementById('club-action-create-event').addEventListener('click', openClubEventCreate);
  document.getElementById('club-action-view-events').addEventListener('click', renderClubEventsList);
  document.getElementById('club-action-add-bureau').addEventListener('click', renderAddBureauMembers);
  document.getElementById('club-action-manage-debt').addEventListener('click', renderClubManageDebt);
  document.getElementById('club-debt-save-button').addEventListener('click', saveClubDebts);
  document.getElementById('club-action-communication').addEventListener('click', openCommunications);
});
