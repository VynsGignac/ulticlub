// ============================================================
// Onglet Calendrier : vue mensuelle classique, en lecture seule. Affiche un point sur les jours
// ayant au moins un evenement (parmi les equipes dont l'utilisateur est membre, et les clubs dont
// il est membre), y compris les occurrences des evenements cycliques (hebdomadaires). Cliquer sur
// un jour avec un point affiche le detail des evenements de ce jour en dessous du calendrier.
// ============================================================

const CALENDRIER_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const CALENDRIER_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const calendrierToday = new Date();
let calendrierYear = calendrierToday.getFullYear();
let calendrierMonth = calendrierToday.getMonth();
let calendrierEventsByDate = new Map();
let calendrierSelectedDate = null;

// Numero de semaine ISO 8601 (lundi = debut de semaine, la semaine 1 est celle contenant le
// premier jeudi de l'annee) -- methode standard : recaler sur le jeudi de la semaine puis compter
// les semaines depuis le 1er janvier de son annee.
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Format YYYY-MM-DD en heure locale (pas toISOString(), qui convertit en UTC et peut decaler le
// jour selon le fuseau horaire).
function toLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Deroule un evenement (eventuellement cyclique/hebdomadaire) en l'ensemble des jours qu'il
// occupe, du debut a la derniere occurrence.
function expandEventDates(evt) {
  const dates = new Set();
  const start = new Date(`${evt.date_debut}T00:00:00`);
  const end = new Date(`${evt.date_fin}T00:00:00`);
  const spanDays = Math.max(0, Math.round((end - start) / 86400000));
  const lastOccurrence = evt.cyclique && evt.date_derniere_occurrence
    ? new Date(`${evt.date_derniere_occurrence}T00:00:00`)
    : start;

  const occurrenceStart = new Date(start);
  // Garde-fou : jamais plus de 260 occurrences (~5 ans hebdomadaires) pour eviter une boucle
  // interminable en cas de date de derniere occurrence aberrante.
  for (let i = 0; i < 260 && occurrenceStart <= lastOccurrence; i++) {
    for (let d = 0; d <= spanDays; d++) {
      const day = new Date(occurrenceStart);
      day.setDate(day.getDate() + d);
      dates.add(toLocalIsoDate(day));
    }
    if (!evt.cyclique) break;
    occurrenceStart.setDate(occurrenceStart.getDate() + 7);
  }
  return dates;
}

// Fusionne les evenements d'equipe (des equipes dont on est membre) et les evenements de club (de
// tous les clubs dont on est membre, quel que soit le club actif), et les indexe par jour pour le
// detail au clic.
async function fetchEventsByDateForCurrentUser() {
  const user = await requireUser();

  const [{ data: teamMemberships }, { data: clubMemberships }] = await Promise.all([
    client.from('team_members').select('team_id').eq('user_id', user.id),
    client.from('club_members').select('club_id').eq('user_id', user.id),
  ]);
  const teamIds = (teamMemberships || []).map((m) => m.team_id);
  const clubIds = (clubMemberships || []).map((m) => m.club_id);

  const eventFields = 'id, nom, date_debut, date_fin, heure_debut, heure_fin, lieu, commentaire, cyclique, date_derniere_occurrence';
  const [teamEventsRes, clubEventsRes] = await Promise.all([
    teamIds.length
      ? client.from('team_events').select(`${eventFields}, teams (nom)`).in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? client.from('club_events').select(`${eventFields}, clubs (nom)`).in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
  ]);

  const eventsByDate = new Map();
  const addEvent = (evt, sourceLabel) => {
    const detail = {
      nom: evt.nom,
      heureDebut: evt.heure_debut,
      heureFin: evt.heure_fin,
      lieu: evt.lieu,
      commentaire: evt.commentaire,
      sourceLabel,
    };
    for (const isoDate of expandEventDates(evt)) {
      if (!eventsByDate.has(isoDate)) eventsByDate.set(isoDate, []);
      eventsByDate.get(isoDate).push(detail);
    }
  };

  for (const evt of teamEventsRes.data || []) addEvent(evt, evt.teams ? evt.teams.nom : 'Équipe');
  for (const evt of clubEventsRes.data || []) addEvent(evt, evt.clubs ? `Club — ${evt.clubs.nom}` : 'Club');

  return eventsByDate;
}

function renderCalendrierDayDetail(isoDate) {
  calendrierSelectedDate = isoDate;
  const detailEl = document.getElementById('calendrier-day-detail');
  const events = calendrierEventsByDate.get(isoDate) || [];

  if (!events.length) {
    detailEl.style.display = 'none';
    detailEl.innerHTML = '';
    return;
  }

  const dateLabel = new Date(`${isoDate}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const wrapper = document.createElement('div');

  const title = document.createElement('h2');
  title.textContent = dateLabel;
  wrapper.appendChild(title);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const evt of events) {
    const li = document.createElement('li');
    li.classList.add('event-detail-item');

    const nomEl = document.createElement('strong');
    nomEl.textContent = evt.nom;
    li.appendChild(nomEl);

    const heures = evt.heureDebut && evt.heureFin ? `${evt.heureDebut.slice(0, 5)} – ${evt.heureFin.slice(0, 5)}` : '';
    const meta = document.createElement('div');
    meta.className = 'communication-meta';
    meta.textContent = [evt.sourceLabel, heures, evt.lieu].filter(Boolean).join(' · ');
    li.appendChild(meta);

    if (evt.commentaire) {
      const comment = document.createElement('div');
      comment.className = 'communication-body';
      comment.textContent = evt.commentaire;
      li.appendChild(comment);
    }

    listEl.appendChild(li);
  }
  wrapper.appendChild(listEl);

  detailEl.innerHTML = '';
  detailEl.appendChild(wrapper);
  detailEl.style.display = '';
}

async function renderCalendrierTab() {
  document.getElementById('calendrier-label').textContent = `${CALENDRIER_MOIS[calendrierMonth]} ${calendrierYear}`;

  const detailEl = document.getElementById('calendrier-day-detail');
  detailEl.style.display = 'none';
  detailEl.innerHTML = '';
  calendrierSelectedDate = null;

  const grid = document.getElementById('calendrier-grid');
  grid.innerHTML = '';

  // Case vide au-dessus de la colonne des numeros de semaine.
  grid.appendChild(document.createElement('div'));

  for (const jour of CALENDRIER_JOURS) {
    const cell = document.createElement('div');
    cell.className = 'calendrier-weekday';
    cell.textContent = jour;
    grid.appendChild(cell);
  }

  // getDay() : 0 = dimanche ... 6 = samedi -- decale pour que la semaine commence lundi.
  const firstWeekday = (new Date(calendrierYear, calendrierMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calendrierYear, calendrierMonth + 1, 0).getDate();
  const trailing = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
  const totalDays = firstWeekday + daysInMonth + trailing;

  const isToday = (date) =>
    date.getFullYear() === calendrierToday.getFullYear() &&
    date.getMonth() === calendrierToday.getMonth() &&
    date.getDate() === calendrierToday.getDate();

  calendrierEventsByDate = await fetchEventsByDateForCurrentUser();

  for (let i = 0; i < totalDays; i += 7) {
    const weekStart = new Date(calendrierYear, calendrierMonth, i - firstWeekday + 1);
    const weekNumCell = document.createElement('div');
    weekNumCell.className = 'calendrier-weeknum';
    weekNumCell.textContent = getISOWeek(weekStart);
    grid.appendChild(weekNumCell);

    for (let j = 0; j < 7; j++) {
      const date = new Date(calendrierYear, calendrierMonth, i + j - firstWeekday + 1);
      const isoDate = toLocalIsoDate(date);
      const outside = date.getMonth() !== calendrierMonth;
      const hasEvent = calendrierEventsByDate.has(isoDate);
      const cell = document.createElement('div');
      cell.className = 'calendrier-day'
        + (outside ? ' outside' : '')
        + (isToday(date) ? ' today' : '')
        + (hasEvent ? ' has-event' : '');
      cell.textContent = date.getDate();
      if (hasEvent) cell.addEventListener('click', () => renderCalendrierDayDetail(isoDate));
      grid.appendChild(cell);
    }
  }
}

function changeCalendrierMonth(delta) {
  calendrierMonth += delta;
  if (calendrierMonth < 0) { calendrierMonth = 11; calendrierYear -= 1; }
  if (calendrierMonth > 11) { calendrierMonth = 0; calendrierYear += 1; }
  renderCalendrierTab();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('calendrier-prev').addEventListener('click', () => changeCalendrierMonth(-1));
  document.getElementById('calendrier-next').addEventListener('click', () => changeCalendrierMonth(1));
});
