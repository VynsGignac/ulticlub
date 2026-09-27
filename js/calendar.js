// ============================================================
// Onglet Calendrier : vue mensuelle classique, en lecture seule. Accueillera plus tard des
// evenements (ponctuels ou cycliques) cliquables pour plus de details -- pas encore implemente,
// cet onglet affiche pour l'instant uniquement la grille du mois avec navigation.
// ============================================================

const CALENDRIER_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const CALENDRIER_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const calendrierToday = new Date();
let calendrierYear = calendrierToday.getFullYear();
let calendrierMonth = calendrierToday.getMonth();

function renderCalendrierTab() {
  document.getElementById('calendrier-label').textContent = `${CALENDRIER_MOIS[calendrierMonth]} ${calendrierYear}`;

  const grid = document.getElementById('calendrier-grid');
  grid.innerHTML = '';

  for (const jour of CALENDRIER_JOURS) {
    const cell = document.createElement('div');
    cell.className = 'calendrier-weekday';
    cell.textContent = jour;
    grid.appendChild(cell);
  }

  // getDay() : 0 = dimanche ... 6 = samedi -- decale pour que la semaine commence lundi.
  const firstWeekday = (new Date(calendrierYear, calendrierMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calendrierYear, calendrierMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendrierYear, calendrierMonth, 0).getDate();

  const isToday = (day) =>
    calendrierYear === calendrierToday.getFullYear() &&
    calendrierMonth === calendrierToday.getMonth() &&
    day === calendrierToday.getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendrier-day outside';
    cell.textContent = daysInPrevMonth - firstWeekday + i + 1;
    grid.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'calendrier-day' + (isToday(day) ? ' today' : '');
    cell.textContent = day;
    grid.appendChild(cell);
  }

  const trailing = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
  for (let day = 1; day <= trailing; day++) {
    const cell = document.createElement('div');
    cell.className = 'calendrier-day outside';
    cell.textContent = day;
    grid.appendChild(cell);
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
