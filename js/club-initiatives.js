// ============================================================
// Mecanisme partage par les onglets Sport, Kid et Vie Associative (2026-10-26) : chacun liste les
// "projets" de son domaine (table club_initiatives, colonne domaine), classes par echeance la plus
// proche en premier. Seuls le nom et l'echeance apparaissent dans la liste ; cliquer sur un projet
// ouvre son detail complet (porteur, description, statut, periodicite), modifiable par tout membre
// du club (pas reserve au bureau). Un bouton "Créer un projet" ouvre le meme formulaire, vide. Les
// 3 onglets appellent les memes fonctions generiques ci-dessous avec leur propre "domaine" -- un
// seul jeu de code pour les trois, puisqu'ils se construisent exactement de la meme facon.
// ============================================================

const CLUB_INITIATIVE_STATUTS = ['Non démarré', 'Amorcé', 'En cours', 'Terminé'];
const CLUB_INITIATIVE_PERIODICITES = ['Ponctuel', 'Hebdomadaire', 'Mensuel', 'Trimestriel', 'Annuel'];

// Un seul domaine/contenu actif a la fois (la fenetre modale de detail/creation n'a pas besoin de
// savoir dans quel onglet elle a ete ouverte autrement que par ces 2 variables, mises a jour juste
// avant chaque ouverture de liste).
let currentInitiativeDomaine = null;
let currentInitiativeClubId = null;

function renderSportTab() { renderClubInitiativesTab('sport', 'sport-content'); }
function renderKidTab() { renderClubInitiativesTab('kid', 'kid-content'); }
function renderVieAssociativeTab() { renderClubInitiativesTab('vie_associative', 'vie-associative-content'); }

async function renderClubInitiativesTab(domaine, contentElId) {
  currentInitiativeDomaine = domaine;
  const contentEl = document.getElementById(contentElId);
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  currentInitiativeClubId = profile ? profile.active_club_id : null;

  if (!currentInitiativeClubId) {
    contentEl.innerHTML = '<p class="message">Aucun club actif.</p>';
    return;
  }

  const { data: initiatives } = await client
    .from('club_initiatives')
    .select('id, nom, porteur, echeance, description, statut, periodicite')
    .eq('club_id', currentInitiativeClubId)
    .eq('domaine', domaine)
    .order('echeance', { ascending: true });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'action-button';
  newButton.textContent = 'Créer un projet';
  newButton.addEventListener('click', () => openInitiativeCreate(contentElId));
  wrapper.appendChild(newButton);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!initiatives || !initiatives.length) {
    listEl.innerHTML = '<li class="empty">Aucun projet pour l’instant.</li>';
  } else {
    for (const initiative of initiatives) {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.className = 'split-view-item-name';
      nameEl.textContent = initiative.nom;
      const metaEl = document.createElement('span');
      metaEl.className = 'split-view-item-meta';
      metaEl.textContent = `Échéance : ${new Date(`${initiative.echeance}T00:00:00`).toLocaleDateString('fr-FR')}`;
      li.appendChild(nameEl);
      li.appendChild(metaEl);
      li.addEventListener('click', () => openInitiativeDetail(initiative, contentElId));
      listEl.appendChild(li);
    }
  }
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function openInitiativeCreate(contentElId) {
  const modalContentEl = showModal('Créer un projet');
  modalContentEl.innerHTML = '';
  modalContentEl.appendChild(buildInitiativeForm(null, contentElId));
}

function openInitiativeDetail(initiative, contentElId) {
  const modalContentEl = showModal(initiative.nom);
  modalContentEl.innerHTML = '';
  modalContentEl.appendChild(buildInitiativeForm(initiative, contentElId));
}

function buildInitiativeForm(existing, contentElId) {
  const form = document.createElement('form');
  form.className = 'panel';

  const addField = (id, labelText, type, required, value) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.required = !!required;
    if (value) input.value = value;
    label.appendChild(input);
    form.appendChild(label);
    return input;
  };

  addField('initiative-nom', 'Nom', 'text', true, existing ? existing.nom : '');
  addField('initiative-porteur', 'Porteur', 'text', false, existing ? existing.porteur : '');
  addField('initiative-echeance', 'Échéance', 'date', true, existing ? existing.echeance : '');

  const descLabel = document.createElement('label');
  descLabel.textContent = 'Description';
  const descArea = document.createElement('textarea');
  descArea.id = 'initiative-description';
  descArea.rows = 4;
  descArea.value = existing ? (existing.description || '') : '';
  descLabel.appendChild(descArea);
  form.appendChild(descLabel);

  const buildSelect = (id, labelText, options, value) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const select = document.createElement('select');
    select.id = id;
    for (const option of options) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      opt.selected = value ? option === value : option === options[0];
      select.appendChild(opt);
    }
    label.appendChild(select);
    form.appendChild(label);
    return select;
  };

  buildSelect('initiative-statut', 'Statut', CLUB_INITIATIVE_STATUTS, existing ? existing.statut : null);
  buildSelect('initiative-periodicite', 'Périodicité', CLUB_INITIATIVE_PERIODICITES, existing ? existing.periodicite : null);

  const infoEl = document.createElement('p');
  infoEl.id = 'initiative-form-info';
  infoEl.className = 'message';
  const errorEl = document.createElement('p');
  errorEl.id = 'initiative-form-error';
  errorEl.className = 'message error';
  form.appendChild(infoEl);
  form.appendChild(errorEl);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = existing ? 'Enregistrer' : 'Créer le projet';
  form.appendChild(submitButton);

  form.addEventListener('submit', (event) => handleInitiativeSave(event, existing, contentElId));

  return form;
}

function readInitiativeFormPayload() {
  return {
    nom: document.getElementById('initiative-nom').value.trim(),
    porteur: document.getElementById('initiative-porteur').value.trim() || null,
    echeance: document.getElementById('initiative-echeance').value,
    description: document.getElementById('initiative-description').value.trim() || null,
    statut: document.getElementById('initiative-statut').value,
    periodicite: document.getElementById('initiative-periodicite').value,
  };
}

async function handleInitiativeSave(event, existing, contentElId) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('initiative-form-error');
  const infoEl = document.getElementById('initiative-form-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const payload = readInitiativeFormPayload();

  submitButton.disabled = true;
  try {
    if (existing) {
      const { error } = await client.from('club_initiatives').update(payload).eq('id', existing.id);
      if (error) {
        setMessage(errorEl, 'Erreur lors de l’enregistrement.', true);
        return;
      }
      Object.assign(existing, payload);
      setMessage(infoEl, 'Modifications enregistrées.');
    } else {
      const user = await requireUser();
      const { error } = await client.from('club_initiatives').insert({
        ...payload,
        club_id: currentInitiativeClubId,
        domaine: currentInitiativeDomaine,
        created_by: user.id,
      });
      if (error) {
        setMessage(errorEl, 'Erreur lors de la création.', true);
        return;
      }
      // Reste sur le formulaire (reinitialise) plutot que de fermer la fenetre : on peut enchainer
      // la creation de plusieurs projets sans la rouvrir a chaque fois (meme choix que pour un
      // projet de club ou un licencie).
      event.target.reset();
      setMessage(infoEl, 'Projet créé.');
    }
    // La liste vit sous la fenetre modale (pas de bouton "Retour" qui la redeclenche) : on la
    // rafraichit en arriere-plan pour qu'elle soit a jour quand la fenetre se ferme.
    renderClubInitiativesTab(currentInitiativeDomaine, contentElId);
  } catch (err) {
    console.error('handleInitiativeSave: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}
