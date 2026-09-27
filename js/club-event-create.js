// ============================================================
// Creation d'un evenement pour tout le club (ouvert depuis "Creer un evenement" dans l'onglet
// Gestion club -- voir js/club-management.js). Equivalent de js/event-create.js mais insere dans
// club_events (visible par tous les membres du club, pas seulement une equipe).
// ============================================================

function openClubEventCreate() {
  let button = document.querySelector('#app-tabs .tab-button[data-tab="club-event-create"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    button.dataset.tab = 'club-event-create';
    button.addEventListener('click', () => selectTab('club-event-create'));
    document.getElementById('app-tabs').appendChild(button);
  }
  button.textContent = 'Créer un événement';

  selectTab('club-event-create');
}

function renderClubEventCreateTab() {
  document.getElementById('club-event-create-form').reset();
  document.getElementById('club-event-derniere-occurrence-label').style.display = 'none';
  setMessage(document.getElementById('club-event-create-error'), '');
  setMessage(document.getElementById('club-event-create-info'), '');
}

function toggleClubEventCycliqueField() {
  const isCyclique = document.getElementById('club-event-cyclique').checked;
  document.getElementById('club-event-derniere-occurrence-label').style.display = isCyclique ? '' : 'none';
  if (!isCyclique) document.getElementById('club-event-derniere-occurrence').value = '';
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

  const payload = {
    club_id: currentGestionClubId,
    nom: document.getElementById('club-event-nom').value.trim(),
    date_debut: document.getElementById('club-event-date-debut').value,
    date_fin: document.getElementById('club-event-date-fin').value,
    heure_debut: document.getElementById('club-event-heure-debut').value,
    heure_fin: document.getElementById('club-event-heure-fin').value,
    lieu: document.getElementById('club-event-lieu').value.trim(),
    commentaire: document.getElementById('club-event-commentaire').value.trim() || null,
    cyclique,
    date_derniere_occurrence: cyclique ? derniereOccurrence : null,
    demande_confirmation: document.getElementById('club-event-demande-confirmation').checked,
  };

  submitButton.disabled = true;
  try {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('club_events').insert({ ...payload, created_by: user.id });
    if (error) {
      setMessage(errorEl, 'Erreur lors de la création de l’événement.', true);
      return;
    }

    document.getElementById('club-event-create-form').reset();
    document.getElementById('club-event-derniere-occurrence-label').style.display = 'none';
    setMessage(infoEl, 'Événement créé.');
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('club-event-cyclique').addEventListener('change', toggleClubEventCycliqueField);
  document.getElementById('club-event-create-form').addEventListener('submit', handleClubEventCreate);
});
