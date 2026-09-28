// ============================================================
// Onglet Saison : regroupe les evenements (d'equipe ou de club) ayant "demander confirmation"
// coche, et les selections d'equipe (candidature) -- les deux ayant en commun d'attendre une
// reaction du joueur. Classes du plus proche au plus lointain (date de la prochaine occurrence pour
// un evenement, date limite de candidature pour une selection) ; les elements entierement passes ne
// sont pas affiches. Reutilise expandEventDates/toLocalIsoDate de js/calendar.js pour geree les
// evenements cycliques de la meme facon que le calendrier.
// ============================================================

async function fetchSaisonItems() {
  const { data: { user } } = await client.auth.getUser();

  const [{ data: teamMemberships }, { data: clubMemberships }] = await Promise.all([
    client.from('team_members').select('team_id').eq('user_id', user.id),
    client.from('club_members').select('club_id').eq('user_id', user.id),
  ]);
  const teamIds = (teamMemberships || []).map((m) => m.team_id);
  const clubIds = (clubMemberships || []).map((m) => m.club_id);

  const eventFields = 'id, nom, date_debut, date_fin, heure_debut, heure_fin, lieu, commentaire, cyclique, date_derniere_occurrence';
  const [teamEventsRes, clubEventsRes, selectionsRes] = await Promise.all([
    teamIds.length
      ? client.from('team_events').select(`${eventFields}, teams (nom)`).eq('demande_confirmation', true).in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? client.from('club_events').select(`${eventFields}, clubs (nom)`).eq('demande_confirmation', true).in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? client.from('team_selections').select('id, date_limite_candidature, commentaire, teams (nom)').in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const todayIso = toLocalIsoDate(new Date());
  const items = [];

  const addEventItem = (evt, sourceLabel) => {
    const upcomingDates = Array.from(expandEventDates(evt)).filter((d) => d >= todayIso).sort();
    if (!upcomingDates.length) return;
    items.push({
      type: 'event',
      date: upcomingDates[0],
      nom: evt.nom,
      sourceLabel,
      heureDebut: evt.heure_debut,
      heureFin: evt.heure_fin,
      lieu: evt.lieu,
      commentaire: evt.commentaire,
    });
  };

  for (const evt of teamEventsRes.data || []) addEventItem(evt, evt.teams ? evt.teams.nom : 'Équipe');
  for (const evt of clubEventsRes.data || []) addEventItem(evt, evt.clubs ? `Club — ${evt.clubs.nom}` : 'Club');

  for (const sel of selectionsRes.data || []) {
    if (sel.date_limite_candidature < todayIso) continue;
    items.push({
      type: 'selection',
      date: sel.date_limite_candidature,
      sourceLabel: sel.teams ? sel.teams.nom : 'Équipe',
      commentaire: sel.commentaire,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

async function renderSaisonTab() {
  const contentEl = document.getElementById('saison-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const items = await fetchSaisonItems();

  if (!items.length) {
    contentEl.innerHTML = '<p class="message">Rien à venir pour l’instant.</p>';
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

    if (item.commentaire) {
      const comment = document.createElement('div');
      comment.className = 'communication-body';
      comment.textContent = item.commentaire;
      li.appendChild(comment);
    }

    listEl.appendChild(li);
  }

  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}
