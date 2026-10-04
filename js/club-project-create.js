// ============================================================
// Creation d'un projet de club (bouton "Projet" dans Gestion club, reserve au bureau). A la
// difference d'un evenement, un projet n'a ni date, ni heure, ni lieu : juste un nom et un
// commentaire libre. Insere dans club_projects ; apparait ensuite pour tous les membres du club
// dans l'onglet "Vie de club" (voir js/vie-club.js), ou chacun peut rejoindre/quitter le projet.
// Ouvert directement depuis Gestion club (pas de liste intermediaire cote bureau -- la liste vit
// dans Vie de club, visible de tous), donc pas de bouton "Retour" : on ferme la fenetre modale.
// ============================================================

function openClubProjectCreate() {
  const contentEl = showModal('Créer un projet');
  contentEl.innerHTML = '';
  contentEl.appendChild(buildClubProjectCreateForm());
}

function buildClubProjectCreateForm() {
  const form = document.createElement('form');
  form.className = 'panel';

  const nomLabel = document.createElement('label');
  nomLabel.textContent = 'Nom du projet';
  const nomInput = document.createElement('input');
  nomInput.type = 'text';
  nomInput.id = 'club-project-nom';
  nomInput.required = true;
  nomLabel.appendChild(nomInput);
  form.appendChild(nomLabel);

  const commentLabel = document.createElement('label');
  commentLabel.textContent = 'Commentaire';
  const commentArea = document.createElement('textarea');
  commentArea.id = 'club-project-commentaire';
  commentArea.rows = 4;
  commentLabel.appendChild(commentArea);
  form.appendChild(commentLabel);

  const infoEl = document.createElement('p');
  infoEl.id = 'club-project-create-info';
  infoEl.className = 'message';
  const errorEl = document.createElement('p');
  errorEl.id = 'club-project-create-error';
  errorEl.className = 'message error';
  form.appendChild(infoEl);
  form.appendChild(errorEl);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Créer le projet';
  form.appendChild(submitButton);

  form.addEventListener('submit', handleClubProjectCreate);

  return form;
}

async function handleClubProjectCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('club-project-create-error');
  const infoEl = document.getElementById('club-project-create-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const nom = document.getElementById('club-project-nom').value.trim();

  submitButton.disabled = true;
  try {
    const user = await requireUser();
    const { error } = await client.from('club_projects').insert({
      club_id: currentGestionClubId,
      nom,
      commentaire: document.getElementById('club-project-commentaire').value.trim() || null,
      created_by: user.id,
    });
    if (error) {
      setMessage(errorEl, 'Erreur lors de la création du projet.', true);
      return;
    }

    // Reste sur le formulaire (reinitialise) plutot que de fermer la fenetre : on peut enchainer la
    // creation de plusieurs projets sans la rouvrir a chaque fois (meme choix que pour un evenement).
    event.target.reset();
    setMessage(infoEl, 'Projet créé.');
  } catch (err) {
    console.error('handleClubProjectCreate: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('club-action-project-create').addEventListener('click', openClubProjectCreate);
});
