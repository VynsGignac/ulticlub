// ============================================================
// Onglet Calendrier : vue mensuelle classique, en lecture seule. Affiche jusqu'a plusieurs points
// colores sur les jours ayant au moins un evenement (parmi les equipes dont l'utilisateur est
// membre, et les clubs dont il est membre), un point par "nature" d'evenement presente ce jour-la
// (voir EVENT_KIND_ORDER plus bas) -- y compris les occurrences des evenements cycliques
// (hebdomadaires). Les projets des onglets Sport/Kid/Vie Associative (table club_initiatives, voir
// js/club-initiatives.js) apparaissent eux aussi, a la date de leur echeance -- un point par
// commission (domaine), filtrable independamment comme les autres natures via la legende. Les dates
// limites de candidature des selections d'equipe (filtrees par portee comme dans l'onglet Saison,
// voir selectionMatchesProfile dans js/saison.js) colorent toute la case en gris clair plutot que
// d'ajouter un point. Cliquer sur un jour marque (point ou case grisee) affiche le detail en
// dessous du calendrier.
// ============================================================

// Ordre d'affichage fixe des points (de gauche a droite) quand plusieurs natures d'evenement
// tombent le meme jour -- garde leur position stable d'un jour a l'autre.
const EVENT_KIND_ORDER = ['equipe', 'responsable', 'club', 'bureau'];
// Domaines des projets (voir club_initiatives.domaine) dans leur ordre d'affichage -- chacun a son
// propre point de couleur et son propre interrupteur de legende, independant de EVENT_KIND_ORDER.
const CALENDRIER_INITIATIVE_DOMAINES = ['sport', 'kid', 'vie_associative'];
const CALENDRIER_DOT_ORDER = [...EVENT_KIND_ORDER, ...CALENDRIER_INITIATIVE_DOMAINES.map((d) => `initiative-${d}`)];

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
// Natures actuellement affichees (legende cliquable, voir toggleCalendrierKind) : toutes visibles
// par defaut. 'selection' est a part des 4 "kind" d'evenement (equipe/responsable/club/bureau) ;
// les projets ont leur propre cle par domaine ("initiative-sport", etc).
let calendrierVisibleKinds = new Set([
  'equipe', 'responsable', 'club', 'bureau', 'selection',
  ...CALENDRIER_INITIATIVE_DOMAINES.map((d) => `initiative-${d}`),
]);

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

// Fusionne les evenements d'equipe (des equipes dont on est membre), les evenements de club (de
// tous les clubs dont on est membre, quel que soit le club actif) et les dates limites de
// candidature des selections d'equipe (filtrees par portee -- genre/age -- comme dans l'onglet
// Saison, voir selectionMatchesProfile dans js/saison.js), et les indexe par jour pour le rendu de
// la grille et le detail au clic.
async function fetchCalendrierItemsByDate() {
  const user = await requireUser();

  const [{ data: teamMemberships }, { data: clubMemberships }, { data: ownProfile }] = await Promise.all([
    client.from('team_members').select('team_id').eq('user_id', user.id),
    client.from('club_members').select('club_id').eq('user_id', user.id),
    client.from('profiles').select('genre, date_naissance').eq('id', user.id).single(),
  ]);
  const teamIds = (teamMemberships || []).map((m) => m.team_id);
  const clubIds = (clubMemberships || []).map((m) => m.club_id);

  const eventFields = 'id, nom, date_debut, date_fin, heure_debut, heure_fin, lieu, commentaire, cyclique, date_derniere_occurrence';
  const [teamEventsRes, clubEventsRes, selectionsRes, initiativesRes] = await Promise.all([
    teamIds.length
      ? client.from('team_events').select(`${eventFields}, responsable_uniquement, teams (nom)`).in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? client.from('club_events').select(`${eventFields}, bureau_uniquement, clubs (nom)`).in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? client.from('team_selections').select('id, date_limite_candidature, commentaire, cible_masculin, cible_feminin, nee_avant_le, nee_apres_le, teams (nom)').in('team_id', teamIds)
      : Promise.resolve({ data: [] }),
    clubIds.length
      ? client.from('club_initiatives').select('id, domaine, nom, porteur, echeance, description, statut, clubs (nom)').in('club_id', clubIds)
      : Promise.resolve({ data: [] }),
  ]);

  const itemsByDate = new Map();
  const addItem = (isoDate, item) => {
    if (!itemsByDate.has(isoDate)) itemsByDate.set(isoDate, []);
    itemsByDate.get(isoDate).push(item);
  };

  const addEvent = (evt, sourceLabel, kind) => {
    const detail = {
      type: 'event',
      kind,
      nom: evt.nom,
      heureDebut: evt.heure_debut,
      heureFin: evt.heure_fin,
      lieu: evt.lieu,
      commentaire: evt.commentaire,
      sourceLabel,
    };
    for (const isoDate of expandEventDates(evt)) addItem(isoDate, detail);
  };

  for (const evt of teamEventsRes.data || []) {
    addEvent(evt, evt.teams ? evt.teams.nom : 'Équipe', evt.responsable_uniquement ? 'responsable' : 'equipe');
  }
  for (const evt of clubEventsRes.data || []) {
    addEvent(evt, evt.clubs ? `Club — ${evt.clubs.nom}` : 'Club', evt.bureau_uniquement ? 'bureau' : 'club');
  }

  for (const initiative of initiativesRes.data || []) {
    addItem(initiative.echeance, {
      type: 'initiative',
      domaine: initiative.domaine,
      nom: initiative.nom,
      porteur: initiative.porteur,
      description: initiative.description,
      statut: initiative.statut,
      sourceLabel: initiative.clubs ? initiative.clubs.nom : 'Club',
    });
  }

  for (const sel of selectionsRes.data || []) {
    if (!selectionMatchesProfile(sel, ownProfile || {})) continue;
    addItem(sel.date_limite_candidature, {
      type: 'selection',
      sourceLabel: sel.teams ? sel.teams.nom : 'Équipe',
      commentaire: sel.commentaire,
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
    nomEl.textContent = item.type === 'selection' ? `Sélection — ${item.sourceLabel}` : item.nom;
    li.appendChild(nomEl);

    const meta = document.createElement('div');
    meta.className = 'communication-meta';
    if (item.type === 'event') {
      const heures = item.heureDebut && item.heureFin ? `${item.heureDebut.slice(0, 5)} – ${item.heureFin.slice(0, 5)}` : '';
      meta.textContent = [item.sourceLabel, heures, item.lieu].filter(Boolean).join(' · ');
    } else if (item.type === 'initiative') {
      meta.textContent = [
        CLUB_INITIATIVE_DOMAINE_LABELS[item.domaine] || item.domaine,
        item.sourceLabel,
        item.porteur ? `Porteur : ${item.porteur}` : null,
        `Statut : ${item.statut}`,
      ].filter(Boolean).join(' · ');
    } else {
      meta.textContent = `${item.sourceLabel} · Candidature avant cette date`;
    }
    li.appendChild(meta);

    const text = item.commentaire || item.description;
    if (text) {
      const comment = document.createElement('div');
      comment.className = 'communication-body';
      comment.textContent = text;
      li.appendChild(comment);
    }

    listEl.appendChild(li);
  }
  wrapper.appendChild(listEl);

  detailEl.innerHTML = '';
  detailEl.appendChild(wrapper);
  detailEl.style.display = '';
}

// Nature d'un item au sens du filtre de legende : les 4 natures d'evenement, une par domaine de
// projet ("initiative-sport", etc), et 'selection' pour les dates limites de candidature (qui
// n'ont pas de "kind"/domaine propre).
function calendrierItemFilterKey(item) {
  if (item.type === 'event') return item.kind;
  if (item.type === 'initiative') return `initiative-${item.domaine}`;
  return 'selection';
}

function isCalendrierItemVisible(item) {
  return calendrierVisibleKinds.has(calendrierItemFilterKey(item));
}

// Legende cliquable (voir index.html, boutons .calendrier-legend-item) : cache/affiche les
// evenements et selections par type, sans re-interroger la base -- calendrierItemsByDate reste
// complet, seul le rendu (grille + detail au clic) applique le filtre.
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
      const dotKinds = new Set(items.filter((it) => it.type !== 'selection').map(calendrierItemFilterKey));
      const hasSelection = items.some((it) => it.type === 'selection');
      const clickable = items.length > 0;

      const cell = document.createElement('div');
      cell.className = 'calendrier-day'
        + (outside ? ' outside' : '')
        + (isToday(date) ? ' today' : '')
        + (clickable ? ' has-event' : '')
        + (hasSelection ? ' has-selection' : '');
      cell.textContent = date.getDate();

      if (dotKinds.size) {
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'calendrier-day-dots';
        for (const kind of CALENDRIER_DOT_ORDER) {
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
