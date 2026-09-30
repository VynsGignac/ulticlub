// ============================================================
// Onglets de l'espace club. Tout le monde est "joueur" (acces a tous les onglets communs, y compris
// desormais "Equipe" -- seul le detail d'une equipe specifique varie selon qu'on en est responsable
// ou non, voir js/team-detail.js) ; membre du bureau debloque en plus "Gestion club". Les onglets
// avec un vrai contenu ont leur propre conteneur dedie (voir CUSTOM_TAB_CONTAINERS) ; les autres
// restent des placeholders en attendant leur implementation. "Tableau de bord" n'est plus un onglet
// de la barre : on y accede via le bouton pseudo/club de l'en-tete (voir js/main.js).
// ============================================================

const TABS = [
  { id: 'calendrier', label: 'Calendrier' },
  { id: 'saison', label: 'Saison' },
  { id: 'vie-club', label: 'Vie de club' },
  { id: 'gestion-equipe', label: 'Équipe' },
  { id: 'gestion-club', label: 'Gestion club', requires: 'membreBureau' },
];

const CUSTOM_TAB_CONTAINERS = {
  calendrier: { containerId: 'tab-content-calendrier', render: renderCalendrierTab },
  saison: { containerId: 'tab-content-saison', render: renderSaisonTab },
  'gestion-equipe': { containerId: 'tab-content-gestion-equipe', render: renderGestionEquipeTab },
  'team-detail': { containerId: 'tab-content-team-detail', render: renderTeamDetailTab },
  'event-create': { containerId: 'tab-content-event-create', render: renderEventCreateTab },
  'selection-create': { containerId: 'tab-content-selection-create', render: renderSelectionCreateTab },
  'gestion-club': { containerId: 'tab-content-gestion-club', render: renderGestionClubTab },
  'club-event-create': { containerId: 'tab-content-club-event-create', render: renderClubEventCreateTab },
  profil: { containerId: 'tab-content-profil', render: renderProfilTab },
  communications: { containerId: 'tab-content-communications', render: renderCommunicationsTab },
  'member-profile': { containerId: 'tab-content-member-profile', render: renderMemberProfileTab },
};

// Dernier onglet reellement selectionne dans #app-tabs (utilise par le bouton flottant
// "communications", accessible depuis n'importe quel onglet, pour savoir ou revenir).
let currentTabId = null;

function tabsVisibleFor(roles) {
  return TABS.filter((tab) => !tab.requires || roles[tab.requires]);
}

function selectTab(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  document.querySelectorAll('#app-tabs .tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });

  // Bouton flottant "Valider" de Gestion club > Gerer dette : ne doit survivre qu'a l'ecran qui
  // l'affiche, pas aux autres onglets (il est en position fixed, donc invisible autrement pour le
  // JS mais visible a l'ecran par-dessus tout le reste).
  if (tabId !== 'gestion-club') hideClubDebtSaveButton();
  document.getElementById('communications-fab').style.display = tabId === 'communications' ? 'none' : '';
  closeModal();

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

  currentTabId = tabId;
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

  const defaultTab = visible.find((t) => t.id === 'calendrier') || visible[0];
  if (defaultTab) selectTab(defaultTab.id);
}
