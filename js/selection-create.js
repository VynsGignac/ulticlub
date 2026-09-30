// ============================================================
// Creation d'une selection pour une equipe (ouvert depuis le bouton "Nouvelle sélection" dans la
// liste des selections -- voir renderTeamSelectionsList dans js/team-detail.js). Pas d'onglet dedie
// dans #app-tabs : la vue s'affiche directement, avec un bouton "Retour" qui revient au detail de
// l'equipe.
// ============================================================

function openSelectionCreate() {
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
  document.getElementById('selection-create-back').addEventListener('click', () => selectTab('team-detail'));
});
