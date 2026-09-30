// ============================================================
// Icone "?" dans l'en-tete de l'app (voir index.html) : ouvre un petit menu avec "A propos" et
// "Guide d'utilisation" via la fenetre modale partagee (voir js/modal.js).
// ============================================================

const USER_GUIDE_URL = 'https://claude.ai/artifact/K5jMJpK1Rwzqm9gwD9KfPn';

// window.open peut echouer silencieusement (bloqueur de popup, WebView sans support des fenetres) :
// on retombe alors sur une navigation directe, que l'app Android intercepte pour l'ouvrir dans le
// navigateur systeme plutot que dans sa propre WebView.
function openExternalLink(url) {
  const newWindow = window.open(url, '_blank');
  if (!newWindow) {
    window.location.href = url;
  }
}

function openHelpMenu() {
  const body = showModal('Aide');

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';

  const aboutItem = document.createElement('li');
  aboutItem.textContent = 'À propos';
  aboutItem.addEventListener('click', renderAboutPanel);
  listEl.appendChild(aboutItem);

  const guideItem = document.createElement('li');
  guideItem.textContent = 'Guide d’utilisation';
  guideItem.addEventListener('click', () => openExternalLink(USER_GUIDE_URL));
  listEl.appendChild(guideItem);

  body.innerHTML = '';
  body.appendChild(listEl);
}

function renderAboutPanel() {
  const body = showModal('À propos');

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const title = document.createElement('h2');
  title.textContent = 'UltiClub';
  wrapper.appendChild(title);

  const version = document.createElement('p');
  version.className = 'communication-meta';
  version.textContent = `Version ${AppVersion}`;
  wrapper.appendChild(version);

  const credit = document.createElement('p');
  credit.className = 'message';
  credit.textContent = 'Développé par Vincent GIBIER avec Claude AI et ChatGPT.';
  wrapper.appendChild(credit);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', openHelpMenu);
  wrapper.appendChild(backButton);

  body.innerHTML = '';
  body.appendChild(wrapper);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('help-menu-button').addEventListener('click', openHelpMenu);
});
