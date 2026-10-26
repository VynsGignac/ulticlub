// ============================================================
// Onglet Calendrier : vue mensuelle classique, en lecture seule. Affiche un point colore par
// commission (Sport/Kid/Vie Associative, voir js/club-initiatives.js) sur les jours ayant au moins
// un projet dont l'echeance tombe ce jour-la, parmi les clubs dont l'utilisateur est membre --
// filtrable independamment par commission via la legende cliquable. Cliquer sur un jour marque
// affiche le detail en dessous du calendrier.
//
// Nettoyage 2026-10-26 : retire les evenements d'equipe/de club et les dates limites de
// candidature aux selections (team_events/club_events/team_selections), qui appartenaient aux
// anciens onglets Gestion club/Equipe/Saison -- retires de la barre principale (voir js/tabs.js) et
// sans plus aucun moyen d'en creer depuis l'app. Ce code (team-detail.js, club-management.js,
// saison.js, selection-create.js, club-event-create.js...) reste intact mais n'est plus affiche
// nulle part, y compris ici desormais.
// ============================================================

// Domaines des projets (voir club_initiatives.domaine) dans leur ordre d'affichage -- chacun a son
// propre point de couleur et son propre interrupteur de legende.
const CALENDRIER_INITIATIVE_DOMAINES = ['sport', 'kid', 'vie_associative'];

const CALENDRIER_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const CALENDRIER_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const calendrierToday = new Date();
let calendrierYear = calendrierToday.getFullYear();
let calendrierMonth = calendrierToday.getMonth();
let calendrierItemsByDate = new Map();
let calendrierSelectedDate = null;
// Commissions actuellement affichees (legende cliquable, voir toggleCalendrierKind) : toutes
// visibles par defaut.
let calendrierVisibleKinds = new Set(CALENDRIER_INITIATIVE_DOMAINES.map((d) => `initiative-${d}`));

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

// Recupere les projets (club_initiatives) de tous les clubs dont l'utilisateur est membre, et les
// indexe par jour d'echeance pour le rendu de la grille et le detail au clic.
async function fetchCalendrierItemsByDate() {
  const user = await requireUser();

  const { data: clubMemberships } = await client.from('club_members').select('club_id').eq('user_id', user.id);
  const clubIds = (clubMemberships || []).map((m) => m.club_id);

  const { data: initiatives } = clubIds.length
    ? await client.from('club_initiatives').select('id, domaine, nom, porteur, echeance, description, statut, clubs (nom)').in('club_id', clubIds)
    : { data: [] };

  const itemsByDate = new Map();
  for (const initiative of initiatives || []) {
    if (!itemsByDate.has(initiative.echeance)) itemsByDate.set(initiative.echeance, []);
    itemsByDate.get(initiative.echeance).push({
      domaine: initiative.domaine,
      nom: initiative.nom,
      porteur: initiative.porteur,
      description: initiative.description,
      statut: initiative.statut,
      sourceLabel: initiative.clubs ? initiative.clubs.nom : 'Club',
    });
  }

  return itemsByDate;
}

function renderCalendrierDayDetail(isoDate) {
  calendrierSelectedDate = isoDate;
  const detailEl = document.getElementById('calendrier-day-detail');
  const items = (calendrierItemsByDate.get(isoDate) || []).filter(isCalendrierItemVisible);

  if (!items.length) {
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
  for (const item of items) {
    const li = document.createElement('li');
    li.classList.add('event-detail-item');

    const nomEl = document.createElement('strong');
    nomEl.textContent = item.nom;
    li.appendChild(nomEl);

    const meta = document.createElement('div');
    meta.className = 'communication-meta';
    meta.textContent = [
      CLUB_INITIATIVE_DOMAINE_LABELS[item.domaine] || item.domaine,
      item.sourceLabel,
      item.porteur ? `Porteur : ${item.porteur}` : null,
      `Statut : ${item.statut}`,
    ].filter(Boolean).join(' · ');
    li.appendChild(meta);

    if (item.description) {
      const comment = document.createElement('div');
      comment.className = 'communication-body';
      comment.textContent = item.description;
      li.appendChild(comment);
    }

    listEl.appendChild(li);
  }
  wrapper.appendChild(listEl);

  detailEl.innerHTML = '';
  detailEl.appendChild(wrapper);
  detailEl.style.display = '';
}

function calendrierItemFilterKey(item) {
  return `initiative-${item.domaine}`;
}

function isCalendrierItemVisible(item) {
  return calendrierVisibleKinds.has(calendrierItemFilterKey(item));
}

// Legende cliquable (voir index.html, boutons .calendrier-legend-item) : cache/affiche les projets
// par commission, sans re-interroger la base -- calendrierItemsByDate reste complet, seul le rendu
// (grille + detail au clic) applique le filtre.
function toggleCalendrierKind(kind) {
  if (calendrierVisibleKinds.has(kind)) {
    calendrierVisibleKinds.delete(kind);
  } else {
    calendrierVisibleKinds.add(kind);
  }
  renderCalendrierLegendState();
  renderCalendrierGrid();
}

function renderCalendrierLegendState() {
  document.querySelectorAll('#tab-content-calendrier .calendrier-legend-item').forEach((button) => {
    button.classList.toggle('inactive', !calendrierVisibleKinds.has(button.dataset.kind));
  });
}

async function renderCalendrierTab() {
  document.getElementById('calendrier-label').textContent = `${CALENDRIER_MOIS[calendrierMonth]} ${calendrierYear}`;
  calendrierItemsByDate = await fetchCalendrierItemsByDate();
  renderCalendrierLegendState();
  renderCalendrierGrid();
}

function renderCalendrierGrid() {
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
      const items = (calendrierItemsByDate.get(isoDate) || []).filter(isCalendrierItemVisible);
      const dotKinds = new Set(items.map(calendrierItemFilterKey));
      const clickable = items.length > 0;

      const cell = document.createElement('div');
      cell.className = 'calendrier-day'
        + (outside ? ' outside' : '')
        + (isToday(date) ? ' today' : '')
        + (clickable ? ' has-event' : '');
      cell.textContent = date.getDate();

      if (dotKinds.size) {
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'calendrier-day-dots';
        for (const domaine of CALENDRIER_INITIATIVE_DOMAINES) {
          const kind = `initiative-${domaine}`;
          if (!dotKinds.has(kind)) continue;
          const dot = document.createElement('span');
          dot.className = `calendrier-dot calendrier-dot-${kind}`;
          dotsWrap.appendChild(dot);
        }
        cell.appendChild(dotsWrap);
      }

      if (clickable) cell.addEventListener('click', () => renderCalendrierDayDetail(isoDate));
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

  document.querySelectorAll('#tab-content-calendrier .calendrier-legend-item').forEach((button) => {
    button.addEventListener('click', () => toggleCalendrierKind(button.dataset.kind));
  });
});
