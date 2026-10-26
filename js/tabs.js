// ============================================================
// Onglets de l'espace club. Refonte de la barre principale (2026-10-26) : on ne garde que
// "Calendrier" de l'ancienne barre, et on la remplace par Bureau / Sport / Kid / Communication /
// Vie Associative / Administratif / Disciplinaire. "Communication" et "Disciplinaire" restent de
// simples placeholders ("contenu a venir") en attendant d'etre definis. "Administratif" (voir
// js/administratif.js) est reserve au role "membre du bureau" car il donne acces a des donnees
// personnelles de licencies (date de naissance, telephone, mail). "Ulticlub" (voir js/ulticlub.js,
// ajoute le 2026-10-26) est lui aussi reserve au bureau : administration des comptes du club --
// valider les admissions en attente, visualiser tous les comptes membres, en retirer un si besoin.
// "Bureau" (voir js/bureau.js)
// liste qui est membre du bureau et qui tient les 3 roles legaux (president/secretaire/tresorier),
// ouvert a tous en lecture -- seul le president peut transferer un role legal. "Sport", "Kid" et
// "Vie Associative" (voir js/club-initiatives.js) partagent le meme mecanisme generique de liste de
// projets par domaine, ouvert a tous. Les 2 seuls roles de compte existent desormais : "membre du
// bureau" (role_membre_bureau) et le role de base implicite "licencié" -- l'ancien role "encadrant"
// a ete retire (voir supabase/schema.sql).
//
// Les anciens onglets (Saison, Vie de club, Equipe, Gestion club) ont ete retires de TABS mais leur
// code reste intact et intentionnellement inchange (team-detail.js, club-management.js,
// vie-club.js, saison.js, selection-create.js, club-event-create.js, club-project-create.js, et
// leurs conteneurs HTML) -- simplement inaccessibles depuis la barre tant qu'on ne decide pas, au
// cas par cas, ou chaque fonctionnalite doit atterrir parmi les nouveaux onglets. Leurs entrees dans
// CUSTOM_TAB_CONTAINERS restent presentes mais ne sont plus jamais declenchees par la barre (aucun
// tab.id de TABS ne les reference), donc sans effet.
//
// "Tableau de bord" n'est pas un onglet de la barre : on y accede via le bouton pseudo/club de
// l'en-tete (voir js/main.js). Les onglets avec un vrai contenu ont leur propre conteneur dedie
// (voir CUSTOM_TAB_CONTAINERS) ; les autres restent des placeholders en attendant leur
// implementation.
// ============================================================

const TABS = [
  { id: 'calendrier', label: 'Calendrier' },
  { id: 'bureau', label: 'Bureau' },
  { id: 'ulticlub', label: 'Ulticlub', requires: 'membreBureau' },
  { id: 'sport', label: 'Sport' },
  { id: 'kid', label: 'Kid' },
  { id: 'communication', label: 'Communication' },
  { id: 'vie-associative', label: 'Vie Associative' },
  { id: 'administratif', label: 'Administratif', requires: 'membreBureau' },
  { id: 'disciplinaire', label: 'Disciplinaire' },
];

const CUSTOM_TAB_CONTAINERS = {
  calendrier: { containerId: 'tab-content-calendrier', render: renderCalendrierTab },
  bureau: { containerId: 'tab-content-bureau', render: renderBureauTab },
  ulticlub: { containerId: 'tab-content-ulticlub', render: renderUlticlubTab },
  administratif: { containerId: 'tab-content-administratif', render: renderAdministratifTab },
  sport: { containerId: 'tab-content-sport', render: renderSportTab },
  kid: { containerId: 'tab-content-kid', render: renderKidTab },
  'vie-associative': { containerId: 'tab-content-vie-associative', render: renderVieAssociativeTab },
  saison: { containerId: 'tab-content-saison', render: renderSaisonTab },
  'vie-club': { containerId: 'tab-content-vie-club', render: renderVieClubTab },
  'gestion-equipe': { containerId: 'tab-content-gestion-equipe', render: renderGestionEquipeTab },
  'selection-create': { containerId: 'tab-content-selection-create', render: renderSelectionCreateTab },
  'gestion-club': { containerId: 'tab-content-gestion-club', render: renderGestionClubTab },
  profil: { containerId: 'tab-content-profil', render: renderProfilTab },
  communications: { containerId: 'tab-content-communications', render: renderCommunicationsTab },
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

    // Point rouge "nouvel element dans Saison" (voir js/saison.js, refreshSaisonBadges) : le
    // conteneur est recree a chaque renderTabs (login, changement de role), donc l'etat est
    // resynchronise juste apres via refreshSaisonBadges() dans enterApp (js/auth.js).
    if (tab.id === 'saison') {
      const badge = document.createElement('span');
      badge.id = 'saison-tab-badge';
      badge.className = 'tab-badge';
      badge.style.display = 'none';
      button.appendChild(badge);
    }

    tabsEl.appendChild(button);
  }

  const defaultTab = visible.find((t) => t.id === 'calendrier') || visible[0];
  if (defaultTab) selectTab(defaultTab.id);
}
