// ============================================================
// Onglets de l'espace club. Tout le monde est "joueur" (acces aux onglets communs) ; les niveaux
// additionnels et cumulables encadrant / membre du bureau debloquent respectivement "Gestion
// equipe" et "Gestion club". Les onglets avec un vrai contenu (Calendrier, Profil...) ont leur
// propre conteneur dedie (voir CUSTOM_TAB_CONTAINERS) ; les autres restent des placeholders en
// attendant leur implementation.
// ============================================================

const TABS = [
  { id: 'calendrier', label: 'Calendrier' },
  { id: 'saison', label: 'Saison' },
  { id: 'administratif', label: 'Administratif' },
  { id: 'vie-club', label: 'Vie de club' },
  { id: 'gestion-equipe', label: 'Gestion équipe', requires: 'encadrant' },
  { id: 'gestion-club', label: 'Gestion club', requires: 'membreBureau' },
  { id: 'profil', label: 'Tableau de bord' },
];

const CUSTOM_TAB_CONTAINERS = {
  calendrier: { containerId: 'tab-content-calendrier', render: renderCalendrierTab },
  'gestion-equipe': { containerId: 'tab-content-gestion-equipe', render: renderGestionEquipeTab },
  'team-detail': { containerId: 'tab-content-team-detail', render: renderTeamDetailTab },
  'event-create': { containerId: 'tab-content-event-create', render: renderEventCreateTab },
  'selection-create': { containerId: 'tab-content-selection-create', render: renderSelectionCreateTab },
  profil: { containerId: 'tab-content-profil', render: renderProfilTab },
};

function tabsVisibleFor(roles) {
  return TABS.filter((tab) => !tab.requires || roles[tab.requires]);
}

function selectTab(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  document.querySelectorAll('#app-tabs .tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });

  const custom = CUSTOM_TAB_CONTAINERS[tabId];
  document.getElementById('app-tab-content').style.display = custom ? 'none' : '';
  for (const key of Object.keys(CUSTOM_TAB_CONTAINERS)) {
    document.getElementById(CUSTOM_TAB_CONTAINERS[key].containerId).style.display = key === tabId ? '' : 'none';
  }

  if (custom) {
    custom.render();
  } else {
    document.getElementById('app-tab-content').textContent = tab ? `${tab.label} — contenu à venir.` : '';
  }
}

function renderTabs(roles) {
  const tabsEl = document.getElementById('app-tabs');
  tabsEl.innerHTML = '';

  const visible = tabsVisibleFor(roles);
  for (const tab of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    button.textContent = tab.label;
    button.dataset.tab = tab.id;
    button.addEventListener('click', () => selectTab(tab.id));
    tabsEl.appendChild(button);
  }

  if (visible.length) selectTab(visible[0].id);
}
