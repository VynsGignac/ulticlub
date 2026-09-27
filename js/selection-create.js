// ============================================================
// Creation d'une selection pour une equipe (ouvert depuis "Gerer les selections" dans le detail
// d'equipe -- voir js/team-detail.js). Utilisee plus tard dans l'onglet Saison ; ici on ne fait
// que la creer.
// ============================================================

function openSelectionCreate() {
  let button = document.querySelector('#app-tabs .tab-button[data-tab="selection-create"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-button';
    button.dataset.tab = 'selection-create';
    button.addEventListener('click', () => selectTab('selection-create'));
    document.getElementById('app-tabs').appendChild(button);
  }
  button.textContent = 'Gérer les sélections';

  selectTab('selection-create');
}

function renderSelectionCreateTab() {
  document.getElementById('selection-create-form').reset();
  setMessage(document.getElementById('selection-create-error'), '');
  setMessage(document.getElementById('selection-create-info'), '');
}

async function handleSelectionCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('selection-create-error');
  const infoEl = document.getElementById('selection-create-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const payload = {
    team_id: currentTeamId,
    date_limite_candidature: document.getElementById('selection-date-limite').value,
    commentaire: document.getElementById('selection-commentaire').value.trim() || null,
  };

  submitButton.disabled = true;
  try {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('team_selections').insert({ ...payload, created_by: user.id });
    if (error) {
      setMessage(errorEl, 'Erreur lors de la création de la sélection.', true);
      return;
    }

    document.getElementById('selection-create-form').reset();
    setMessage(infoEl, 'Sélection créée.');
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('selection-create-form').addEventListener('submit', handleSelectionCreate);
});
