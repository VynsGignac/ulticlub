// ============================================================
// Onglets de l'espace club. Tout le monde est "joueur" (acces aux onglets communs) ; les niveaux
// additionnels et cumulables encadrant / membre du bureau debloquent respectivement "Gestion
// equipe" et "Gestion club". Seul l'onglet Profil a un vrai contenu (voir js/profile.js) ; les
// autres sont des placeholders en attendant leur implementation.
// ============================================================

const TABS = [
  { id: 'calendrier', label: 'Calendrier' },
  { id: 'saison', label: 'Saison' },
  { id: 'administratif', label: 'Administratif' },
  { id: 'vie-club', label: 'Vie de club' },
  { id: 'gestion-equipe', label: 'Gestion équipe', requires: 'encadrant' },
  { id: 'gestion-club', label: 'Gestion club', requires: 'membreBureau' },
  { id: 'profil', label: 'Profil' },
];

function tabsVisibleFor(roles) {
  return TABS.filter((tab) => !tab.requires || roles[tab.requires]);
}

function selectTab(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  document.querySelectorAll('#app-tabs .tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });

  const isProfil = tabId === 'profil';
  document.getElementById('app-tab-content').style.display = isProfil ? 'none' : '';
  document.getElementById('tab-content-profil').style.display = isProfil ? '' : 'none';

  if (isProfil) {
    renderProfilTab();
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
