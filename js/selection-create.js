// ============================================================
// Creation d'une selection pour une equipe (ouvert depuis le bouton "Nouvelle sélection" dans la
// liste des selections -- voir renderTeamSelectionsList dans js/team-detail.js). Utilise encore un
// onglet dedie (pas la fenetre modale partagee) ; son bouton "Retour" revient a la liste des
// selections (qui, elle, s'affiche dans la fenetre modale).
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

  const cibleMasculin = document.getElementById('selection-cible-masculin').checked;
  const cibleFeminin = document.getElementById('selection-cible-feminin').checked;
  if (!cibleMasculin && !cibleFeminin) {
    setMessage(errorEl, 'Coche au moins Homme ou Femme.', true);
    return;
  }

  const payload = {
    team_id: currentTeamId,
    date_limite_candidature: document.getElementById('selection-date-limite').value,
    cible_masculin: cibleMasculin,
    cible_feminin: cibleFeminin,
    nee_avant_le: document.getElementById('selection-nee-avant').value || null,
    nee_apres_le: document.getElementById('selection-nee-apres').value || null,
    commentaire: document.getElementById('selection-commentaire').value.trim() || null,
  };

  submitButton.disabled = true;
  try {
    const user = await requireUser();
    const { error } = await client.from('team_selections').insert({ ...payload, created_by: user.id });
    if (error) {
      setMessage(errorEl, 'Erreur lors de la création de la sélection.', true);
      return;
    }

    document.getElementById('selection-create-form').reset();
    setMessage(infoEl, 'Sélection créée.');
    // Si le createur est lui-meme concerne par cette nouvelle selection (genre/age cibles), le
    // point rouge Saison doit apparaitre tout de suite -- sans ca il ne se recalculerait qu'a la
    // prochaine connexion (voir refreshSaisonBadges, normalement appele uniquement dans enterApp).
    refreshSaisonBadges();
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('selection-create-form').addEventListener('submit', handleSelectionCreate);
  document.getElementById('selection-create-back').addEventListener('click', renderTeamSelectionsList);
});
