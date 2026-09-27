// ============================================================
// Creation d'un evenement pour une equipe (ouvert depuis "Creer un evenement" dans le detail
// d'equipe -- voir js/team-detail.js). Cyclique = hebdomadaire ; dans ce cas la date de derniere
// occurrence est obligatoire. "Demander confirmation" ne pilote encore aucune logique, son usage
// sera defini plus tard. L'affichage des evenements (calendrier, etc.) viendra dans une prochaine
// etape : ici on ne fait que les creer.
// ============================================================

function openEventCreate() {
  let button = document.querySelector('#app-tabs .tab-button[data-tab="event-create"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    button.dataset.tab = 'event-create';
    button.addEventListener('click', () => selectTab('event-create'));
    document.getElementById('app-tabs').appendChild(button);
  }
  button.textContent = 'Créer un événement';

  selectTab('event-create');
}

function renderEventCreateTab() {
  document.getElementById('event-create-form').reset();
  document.getElementById('event-derniere-occurrence-label').style.display = 'none';
  setMessage(document.getElementById('event-create-error'), '');
  setMessage(document.getElementById('event-create-info'), '');
}

function toggleCycliqueField() {
  const isCyclique = document.getElementById('event-cyclique').checked;
  document.getElementById('event-derniere-occurrence-label').style.display = isCyclique ? '' : 'none';
  if (!isCyclique) document.getElementById('event-derniere-occurrence').value = '';
}

async function handleEventCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('event-create-error');
  const infoEl = document.getElementById('event-create-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const cyclique = document.getElementById('event-cyclique').checked;
  const derniereOccurrence = document.getElementById('event-derniere-occurrence').value || null;
  if (cyclique && !derniereOccurrence) {
    setMessage(errorEl, 'Indique la date de dernière occurrence pour un événement cyclique.', true);
    return;
  }

  const payload = {
    team_id: currentTeamId,
    nom: document.getElementById('event-nom').value.trim(),
    date_debut: document.getElementById('event-date-debut').value,
    date_fin: document.getElementById('event-date-fin').value,
    heure_debut: document.getElementById('event-heure-debut').value,
    heure_fin: document.getElementById('event-heure-fin').value,
    lieu: document.getElementById('event-lieu').value.trim(),
    commentaire: document.getElementById('event-commentaire').value.trim() || null,
    cyclique,
    date_derniere_occurrence: cyclique ? derniereOccurrence : null,
    demande_confirmation: document.getElementById('event-demande-confirmation').checked,
  };

  submitButton.disabled = true;
  try {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('team_events').insert({ ...payload, created_by: user.id });
    if (error) {
      setMessage(errorEl, 'Erreur lors de la création de l’événement.', true);
      return;
    }

    document.getElementById('event-create-form').reset();
    document.getElementById('event-derniere-occurrence-label').style.display = 'none';
    setMessage(infoEl, 'Événement créé.');
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('event-cyclique').addEventListener('change', toggleCycliqueField);
  document.getElementById('event-create-form').addEventListener('submit', handleEventCreate);
});
