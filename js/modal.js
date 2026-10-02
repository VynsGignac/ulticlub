// ============================================================
// Fenetre plein ecran generique, ouverte par-dessus l'ecran courant : utilisee partout ou un
// contenu (liste de membres, d'evenements, de candidatures...) serait sinon rendu directement sous
// des boutons d'action, peu visible et peu pratique a faire defiler sur telephone -- voir
// js/team-detail.js et js/club-management.js. Couvre tout l'ecran (pas une liste deroulante en bas)
// avec un bouton "Retour" dans l'en-tete ; les vues avec un niveau de detail supplementaire
// (cliquer sur un evenement dans une liste, par exemple) gardent leur propre bouton "Retour" a
// l'interieur du corps pour remonter d'un niveau sans fermer la fenetre -- showModal() peut etre
// appelee de nouveau pendant qu'elle est deja ouverte, elle remplace juste son contenu.
// ============================================================

function showModal(title) {
  document.getElementById('app-modal-title').textContent = title;
  const body = document.getElementById('app-modal-body');
  body.innerHTML = '<p class="message">Chargement...</p>';
  // Reinitialise a chaque ouverture : seul js/club-management.js (Evenement club, scroll
  // independant par colonne) rajoute cette classe lui-meme -- voir .no-scroll dans index.html.
  body.classList.remove('no-scroll');
  document.getElementById('app-modal-overlay').style.display = 'flex';
  return body;
}

function closeModal() {
  document.getElementById('app-modal-overlay').style.display = 'none';
  document.getElementById('app-modal-body').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('app-modal-close').addEventListener('click', closeModal);
});
