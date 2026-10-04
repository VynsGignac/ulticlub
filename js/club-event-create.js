// ============================================================
// Creation d'un evenement pour tout le club (ouvert depuis le bouton "Nouvel evenement" dans la
// liste "Evenement club" -- voir js/club-management.js). Equivalent de js/event-create.js mais
// insere dans club_events (visible par tous les membres du club, pas seulement une equipe).
// Construit dynamiquement a chaque ouverture (comme renderClubTeamCreate) et affiche dans la
// fenetre modale partagee (voir js/modal.js) au lieu d'un onglet separe -- cliquer sur "Nouvel
// evenement" reste dans la meme fenetre plutot que d'en ouvrir une autre. Le "Retour" revient a la
// liste des evenements, dans la meme fenetre.
// ============================================================

function openClubEventCreate() {
  const contentEl = showModal('Créer un événement');
  contentEl.innerHTML = '';
  contentEl.appendChild(buildClubEventCreateForm());
}

function buildClubEventCreateForm() {
  const form = document.createElement('form');
  form.className = 'panel';

  const addField = (id, labelText, type, required) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.required = required;
    label.appendChild(input);
    form.appendChild(label);
    return input;
  };

  addField('club-event-nom', 'Nom de l’événement', 'text', true);
  addField('club-event-date-debut', 'Date de début', 'date', true);
  addField('club-event-date-fin', 'Date de fin (optionnel, = date de début si vide)', 'date', false);
  addField('club-event-heure-debut', 'Heure de début', 'time', true);
  addField('club-event-heure-fin', 'Heure de fin (optionnel, = heure de début si vide)', 'time', false);
  addField('club-event-lieu', 'Lieu (optionnel)', 'text', false);

  const commentLabel = document.createElement('label');
  commentLabel.textContent = 'Commentaire';
  const commentArea = document.createElement('textarea');
  commentArea.id = 'club-event-commentaire';
  commentArea.rows = 3;
  commentLabel.appendChild(commentArea);
  form.appendChild(commentLabel);

  const addCheckbox = (id, labelText) => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(labelText));
    form.appendChild(label);
    return checkbox;
  };

  const cycliqueCheckbox = addCheckbox('club-event-cyclique', 'Cyclique (toutes les semaines)');

  const derniereLabel = document.createElement('label');
  derniereLabel.id = 'club-event-derniere-occurrence-label';
  derniereLabel.style.display = 'none';
  derniereLabel.textContent = 'Date de dernière occurrence';
  const derniereInput = document.createElement('input');
  derniereInput.type = 'date';
  derniereInput.id = 'club-event-derniere-occurrence';
  derniereLabel.appendChild(derniereInput);
  form.appendChild(derniereLabel);

  cycliqueCheckbox.addEventListener('change', () => {
    derniereLabel.style.display = cycliqueCheckbox.checked ? '' : 'none';
    if (!cycliqueCheckbox.checked) derniereInput.value = '';
  });

  addCheckbox('club-event-demande-confirmation', 'Demander confirmation');
  addCheckbox('club-event-bureau-uniquement', 'Bureau uniquement');

  const infoEl = document.createElement('p');
  infoEl.id = 'club-event-create-info';
  infoEl.className = 'message';
  const errorEl = document.createElement('p');
  errorEl.id = 'club-event-create-error';
  errorEl.className = 'message error';
  form.appendChild(infoEl);
  form.appendChild(errorEl);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Créer l’événement';
  form.appendChild(submitButton);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', renderClubEventsList);
  form.appendChild(backButton);

  form.addEventListener('submit', handleClubEventCreate);

  return form;
}

async function handleClubEventCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('club-event-create-error');
  const infoEl = document.getElementById('club-event-create-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const cyclique = document.getElementById('club-event-cyclique').checked;
  const derniereOccurrence = document.getElementById('club-event-derniere-occurrence').value || null;
  if (cyclique && !derniereOccurrence) {
    setMessage(errorEl, 'Indique la date de dernière occurrence pour un événement cyclique.', true);
    return;
  }

  const dateDebut = document.getElementById('club-event-date-debut').value;
  const heureDebut = document.getElementById('club-event-heure-debut').value;

  const payload = {
    club_id: currentGestionClubId,
    nom: document.getElementById('club-event-nom').value.trim(),
    date_debut: dateDebut,
    date_fin: document.getElementById('club-event-date-fin').value || dateDebut,
    heure_debut: heureDebut,
    heure_fin: document.getElementById('club-event-heure-fin').value || heureDebut,
    lieu: document.getElementById('club-event-lieu').value.trim() || null,
    commentaire: document.getElementById('club-event-commentaire').value.trim() || null,
    cyclique,
    date_derniere_occurrence: cyclique ? derniereOccurrence : null,
    demande_confirmation: document.getElementById('club-event-demande-confirmation').checked,
    bureau_uniquement: document.getElementById('club-event-bureau-uniquement').checked,
  };

  submitButton.disabled = true;
  try {
    const user = await requireUser();
    const { error } = await client.from('club_events').insert({ ...payload, created_by: user.id });
    if (error) {
      setMessage(errorEl, 'Erreur lors de la création de l’événement.', true);
      return;
    }

    // Reste sur le formulaire (reinitialise) plutot que de revenir a la liste : on peut enchainer
    // la creation de plusieurs evenements sans rouvrir la fenetre a chaque fois.
    event.target.reset();
    document.getElementById('club-event-derniere-occurrence-label').style.display = 'none';
    setMessage(infoEl, 'Événement créé.');
    // Si le createur est lui-meme concerne par ce nouvel evenement (membre du club), le point rouge
    // Saison doit apparaitre tout de suite -- sans ca il ne se recalculerait qu'a la prochaine
    // connexion (voir refreshSaisonBadges, normalement appele uniquement dans enterApp).
    refreshSaisonBadges();
  } catch (err) {
    console.error('handleClubEventCreate: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}
