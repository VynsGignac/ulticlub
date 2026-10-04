// ============================================================
// Onglet Saison : regroupe les evenements (d'equipe ou de club) ayant "demander confirmation"
// coche, et les selections d'equipe (candidature) -- les deux ayant en commun d'attendre une
// reaction du joueur, via les boutons Present/Absent ou Postuler dans la fenetre de detail. Deux
// sous-onglets (Evenement / Selection, voir index.html et selectSaisonSubTab ci-dessous) ne
// montrent chacun que les elements de leur type ; cliquer sur un element de la liste ouvre une
// fenetre (js/modal.js) avec ses informations completes et le bouton d'action correspondant.
// Classes du plus proche au plus lointain (date de la prochaine occurrence pour un evenement, date
// limite de candidature pour une selection) ; les elements entierement passes ne sont pas
// affiches. Reutilise expandEventDates/toLocalIsoDate de js/calendar.js pour geree les evenements
// cycliques de la meme facon que le calendrier. Les reponses (team_event_confirmations /
// club_event_confirmations / team_selection_candidatures) sont visibles par les encadrants/le
// bureau depuis le detail d'equipe / Gestion club -- voir js/team-detail.js et
// js/club-management.js.
// ============================================================

// Une selection ne doit apparaitre que pour les membres qu'elle cible (voir
// js/selection-create.js) : genre (Homme/Femme, les 2 cases cochees = ouvert a tout le monde quel
// que soit le genre) et bornes optionnelles de date de naissance (cumulables). Si une borne de date
// est posee et que le membre n'a pas renseigne sa date de naissance, on ne peut pas confirmer qu'il
// est concerne -- la selection ne lui est pas montree.
function selectionMatchesProfile(sel, profile) {
  const genreOk = (sel.cible_masculin && sel.cible_feminin)
    || (sel.cible_masculin && profile.genre === 'Masculin')
    || (sel.cible_feminin && profile.genre === 'Féminin');
  if (!genreOk) return false;

  if (sel.nee_avant_le || sel.nee_apres_le) {
    if (!profile.date_naissance) return false;
    if (sel.nee_avant_le && !(profile.date_naissance < sel.nee_avant_le)) return false;
    if (sel.nee_apres_le && !(profile.date_naissance > sel.nee_apres_le)) return false;
  }

  return true;
}

function formatSelectionPortee(item) {
  const genre = item.cibleMasculin && item.cibleFeminin
    ? 'Hommes et femmes'
    : item.cibleMasculin ? 'Hommes' : 'Femmes';
  const parts = [genre];
  if (item.neeApresLe) {
    parts.push(`née/né après le ${new Date(`${item.neeApresLe}T00:00:00`).toLocaleDateString('fr-FR')}`);
  }
  if (item.neeAvantLe) {
    parts.push(`née/né avant le ${new Date(`${item.neeAvantLe}T00:00:00`).toLocaleDateString('fr-FR')}`);
  }
  return parts.join(' · ');
}

async function fetchSaisonItems() {
  const user = await requireUser();

  const [{ data: teamMemberships }, { data: clubMemberships }, { data: ownProfile }] = await Promise.all([
    client.from('team_members').select('team_id').eq('user_id', user.id),
    client.from('club_members').select('club_id').eq('user_id', user.id),
    client.from('profiles').select('genre, date_naissance').eq('id', user.id).single(),
  ]);
  const teamIds = (teamMemberships || []).map((m) => m.team_id);
  const clubIds = (clubMemberships || []).map((m) => m.club_id);

  const eventFields = 'id, nom, date_debut, date_fin, heure_debut, heure_fin, lieu, commentaire, cyclique, date_derniere_occurrence';
  const [teamEventsRes, clubEventsRes, selectionsRes, teamConfirmRes, clubConfirmRes, candidaturesRes] = await Promise.all([
    teamIds.length
      ? client.from('team_events').select(`${eventFields}, teams (nom)`).eq('demande_confirmation', true).in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? client.from('club_events').select(`${eventFields}, clubs (nom)`).eq('demande_confirmation', true).in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? client.from('team_selections').select('id, date_limite_candidature, commentaire, cible_masculin, cible_feminin, nee_avant_le, nee_apres_le, teams (nom)').in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    client.from('team_event_confirmations').select('team_event_id, present').eq('user_id', user.id),
    client.from('club_event_confirmations').select('club_event_id, present').eq('user_id', user.id),
    client.from('team_selection_candidatures').select('selection_id').eq('user_id', user.id),
  ]);

  const teamResponseByEventId = new Map((teamConfirmRes.data || []).map((c) => [c.team_event_id, c.present]));
  const clubResponseByEventId = new Map((clubConfirmRes.data || []).map((c) => [c.club_event_id, c.present]));
  const candidateSelectionIds = new Set((candidaturesRes.data || []).map((c) => c.selection_id));

  const todayIso = toLocalIsoDate(new Date());
  const items = [];

  const addEventItem = (evt, sourceLabel, confirmTable, confirmIdField, responseByEventId) => {
    const upcomingDates = Array.from(expandEventDates(evt)).filter((d) => d >= todayIso).sort();
    if (!upcomingDates.length) return;
    items.push({
      type: 'event',
      date: upcomingDates[0],
      id: evt.id,
      nom: evt.nom,
      sourceLabel,
      heureDebut: evt.heure_debut,
      heureFin: evt.heure_fin,
      lieu: evt.lieu,
      commentaire: evt.commentaire,
      confirmTable,
      confirmIdField,
      response: responseByEventId.has(evt.id) ? responseByEventId.get(evt.id) : null,
    });
  };

  for (const evt of teamEventsRes.data || []) {
    addEventItem(evt, evt.teams ? evt.teams.nom : 'Équipe', 'team_event_confirmations', 'team_event_id', teamResponseByEventId);
  }
  for (const evt of clubEventsRes.data || []) {
    addEventItem(evt, evt.clubs ? `Club — ${evt.clubs.nom}` : 'Club', 'club_event_confirmations', 'club_event_id', clubResponseByEventId);
  }

  for (const sel of selectionsRes.data || []) {
    if (sel.date_limite_candidature < todayIso) continue;
    if (!selectionMatchesProfile(sel, ownProfile || {})) continue;
    items.push({
      type: 'selection',
      date: sel.date_limite_candidature,
      id: sel.id,
      sourceLabel: sel.teams ? sel.teams.nom : 'Équipe',
      commentaire: sel.commentaire,
      isCandidate: candidateSelectionIds.has(sel.id),
      cibleMasculin: sel.cible_masculin,
      cibleFeminin: sel.cible_feminin,
      neeAvantLe: sel.nee_avant_le,
      neeApresLe: sel.nee_apres_le,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

async function respondToEvent(confirmTable, confirmIdField, eventId, present) {
  const user = await requireUser();
  await client.from(confirmTable).upsert(
    { [confirmIdField]: eventId, user_id: user.id, present },
    { onConflict: `${confirmIdField},user_id` },
  );
}

async function toggleCandidature(selectionId, alreadyCandidate) {
  const user = await requireUser();
  if (alreadyCandidate) {
    await client.from('team_selection_candidatures').delete().eq('selection_id', selectionId).eq('user_id', user.id);
  } else {
    await client.from('team_selection_candidatures').insert({ selection_id: selectionId, user_id: user.id });
  }
}

function renderSaisonTab() {
  selectSaisonSubTab('evenement');
}

function selectSaisonSubTab(subTabId) {
  document.querySelectorAll('#tab-content-saison .subtab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.subtab === subTabId);
  });
  document.getElementById('saison-subtab-evenement').style.display = subTabId === 'evenement' ? '' : 'none';
  document.getElementById('saison-subtab-selection').style.display = subTabId === 'selection' ? '' : 'none';

  if (subTabId === 'evenement') {
    renderSaisonEvenementSubTab();
  } else {
    renderSaisonSelectionSubTab();
  }
}

async function renderSaisonEvenementSubTab() {
  const contentEl = document.getElementById('saison-evenement-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';
  const items = (await fetchSaisonItems()).filter((item) => item.type === 'event');
  renderSaisonItemsList(contentEl, items, 'Aucun événement à venir pour l’instant.');
}

async function renderSaisonSelectionSubTab() {
  const contentEl = document.getElementById('saison-selection-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';
  const items = (await fetchSaisonItems()).filter((item) => item.type === 'selection');
  renderSaisonItemsList(contentEl, items, 'Aucune sélection à venir pour l’instant.');
}

function renderSaisonItemsList(contentEl, items, emptyMessage) {
  contentEl.innerHTML = '';

  if (!items.length) {
    contentEl.innerHTML = `<p class="message">${emptyMessage}</p>`;
    return;
  }

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';

  for (const item of items) {
    const li = document.createElement('li');
    li.classList.add('event-detail-item');

    const dateLabel = new Date(`${item.date}T00:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    const title = document.createElement('strong');
    title.textContent = item.type === 'event' ? item.nom : `Sélection — ${item.sourceLabel}`;
    li.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'communication-meta';
    if (item.type === 'event') {
      const heures = item.heureDebut && item.heureFin ? `${item.heureDebut.slice(0, 5)} – ${item.heureFin.slice(0, 5)}` : '';
      meta.textContent = [item.sourceLabel, dateLabel, heures, item.lieu].filter(Boolean).join(' · ');
    } else {
      meta.textContent = `Candidature avant le ${dateLabel}`;
    }
    li.appendChild(meta);

    li.addEventListener('click', () => openSaisonItemDetail(item));
    listEl.appendChild(li);
  }

  contentEl.appendChild(listEl);
}

function openSaisonItemDetail(item) {
  showModal(item.type === 'event' ? item.nom : `Sélection — ${item.sourceLabel}`);
  renderSaisonItemDetailBody(item);
}

function renderSaisonItemDetailBody(item) {
  const body = document.getElementById('app-modal-body');
  body.innerHTML = '';

  const dateLabel = new Date(`${item.date}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const meta = document.createElement('p');
  meta.className = 'communication-meta';
  if (item.type === 'event') {
    const heures = item.heureDebut && item.heureFin ? `${item.heureDebut.slice(0, 5)} – ${item.heureFin.slice(0, 5)}` : '';
    meta.textContent = [item.sourceLabel, dateLabel, heures, item.lieu].filter(Boolean).join(' · ');
  } else {
    meta.textContent = `${item.sourceLabel} · Candidature avant le ${dateLabel}`;
  }
  body.appendChild(meta);

  if (item.type === 'selection') {
    const portee = document.createElement('p');
    portee.className = 'communication-meta';
    portee.textContent = `Portée : ${formatSelectionPortee(item)}`;
    body.appendChild(portee);
  }

  if (item.commentaire) {
    const comment = document.createElement('p');
    comment.className = 'communication-body';
    comment.textContent = item.commentaire;
    body.appendChild(comment);
  }

  const actions = document.createElement('div');
  actions.className = 'saison-item-actions';

  if (item.type === 'event') {
    const presentBtn = document.createElement('button');
    presentBtn.type = 'button';
    presentBtn.className = 'action-button';
    presentBtn.textContent = 'Présent';
    presentBtn.classList.toggle('highlight', item.response === true);
    presentBtn.addEventListener('click', async () => {
      await respondToEvent(item.confirmTable, item.confirmIdField, item.id, true);
      item.response = true;
      renderSaisonItemDetailBody(item);
    });

    const absentBtn = document.createElement('button');
    absentBtn.type = 'button';
    absentBtn.className = 'action-button';
    absentBtn.textContent = 'Absent';
    absentBtn.classList.toggle('highlight', item.response === false);
    absentBtn.addEventListener('click', async () => {
      await respondToEvent(item.confirmTable, item.confirmIdField, item.id, false);
      item.response = false;
      renderSaisonItemDetailBody(item);
    });

    actions.appendChild(presentBtn);
    actions.appendChild(absentBtn);
  } else {
    const candidateBtn = document.createElement('button');
    candidateBtn.type = 'button';
    candidateBtn.className = 'action-button';
    candidateBtn.classList.toggle('highlight', item.isCandidate);
    candidateBtn.textContent = item.isCandidate ? 'Retirer ma candidature' : 'Postuler';
    candidateBtn.addEventListener('click', async () => {
      await toggleCandidature(item.id, item.isCandidate);
      item.isCandidate = !item.isCandidate;
      renderSaisonItemDetailBody(item);
    });
    actions.appendChild(candidateBtn);
  }

  body.appendChild(actions);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#tab-content-saison .subtab-button').forEach((button) => {
    button.addEventListener('click', () => selectSaisonSubTab(button.dataset.subtab));
  });
});
