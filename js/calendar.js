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

function renderCalendrierTab() {
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

  for (let i = 0; i < totalDays; i += 7) {
    const weekStart = new Date(calendrierYear, calendrierMonth, i - firstWeekday + 1);
    const weekNumCell = document.createElement('div');
    weekNumCell.className = 'calendrier-weeknum';
    weekNumCell.textContent = getISOWeek(weekStart);
    grid.appendChild(weekNumCell);

    for (let j = 0; j < 7; j++) {
      const date = new Date(calendrierYear, calendrierMonth, i + j - firstWeekday + 1);
      const outside = date.getMonth() !== calendrierMonth;
      const cell = document.createElement('div');
      cell.className = 'calendrier-day' + (outside ? ' outside' : '') + (isToday(date) ? ' today' : '');
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
