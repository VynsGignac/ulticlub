// ============================================================
// Onglet Calendrier : vue mensuelle classique, en lecture seule. Affiche un point sur les jours
// ayant au moins un evenement (parmi les equipes dont l'utilisateur est membre), y compris les
// occurrences des evenements cycliques (hebdomadaires). Le detail au clic viendra plus tard.
// ============================================================

const CALENDRIER_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const CALENDRIER_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const calendrierToday = new Date();
let calendrierYear = calendrierToday.getFullYear();
let calendrierMonth = calendrierToday.getMonth();

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

// Fusionne les evenements d'equipe (des equipes dont on est membre) et les evenements de club
// (de tous les clubs dont on est membre, quel que soit le club actif).
async function fetchEventDatesForCurrentUser() {
  const { data: { user } } = await client.auth.getUser();

  const [{ data: teamMemberships }, { data: clubMemberships }] = await Promise.all([
    client.from('team_members').select('team_id').eq('user_id', user.id),
    client.from('club_members').select('club_id').eq('user_id', user.id),
  ]);
  const teamIds = (teamMemberships || []).map((m) => m.team_id);
  const clubIds = (clubMemberships || []).map((m) => m.club_id);

  const [teamEventsRes, clubEventsRes] = await Promise.all([
    teamIds.length
      ? client.from('team_events').select('date_debut, date_fin, cyclique, date_derniere_occurrence').in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? client.from('club_events').select('date_debut, date_fin, cyclique, date_derniere_occurrence').in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
  ]);

  const allDates = new Set();
  for (const evt of [...(teamEventsRes.data || []), ...(clubEventsRes.data || [])]) {
    for (const isoDate of expandEventDates(evt)) allDates.add(isoDate);
  }
  return allDates;
}

async function renderCalendrierTab() {
  document.getElementById('calendrier-label').textContent = `${CALENDRIER_MOIS[calendrierMonth]} ${calendrierYear}`;

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

  const eventDates = await fetchEventDatesForCurrentUser();

  for (let i = 0; i < totalDays; i += 7) {
    const weekStart = new Date(calendrierYear, calendrierMonth, i - firstWeekday + 1);
    const weekNumCell = document.createElement('div');
    weekNumCell.className = 'calendrier-weeknum';
    weekNumCell.textContent = getISOWeek(weekStart);
    grid.appendChild(weekNumCell);

    for (let j = 0; j < 7; j++) {
      const date = new Date(calendrierYear, calendrierMonth, i + j - firstWeekday + 1);
      const outside = date.getMonth() !== calendrierMonth;
      const hasEvent = eventDates.has(toLocalIsoDate(date));
      const cell = document.createElement('div');
      cell.className = 'calendrier-day'
        + (outside ? ' outside' : '')
        + (isToday(date) ? ' today' : '')
        + (hasEvent ? ' has-event' : '');
      cell.textContent = date.getDate();
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
