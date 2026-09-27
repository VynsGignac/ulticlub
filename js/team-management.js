// ============================================================
// Sous-onglets de "Gestion equipe" (reserve aux encadrants du club actif) :
// - Equipes actuelles : liste des equipes du club, celles dont le joueur est responsable
//   d'abord, puis toutes les autres.
// - Creation d'equipe : cree une equipe dans le club actif, le createur en devient responsable.
// ============================================================

function renderGestionEquipeTab() {
  selectEquipeSubTab('equipes-actuelles');
}

function selectEquipeSubTab(subTabId) {
  document.querySelectorAll('#tab-content-gestion-equipe .subtab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.subtab === subTabId);
  });
  document.getElementById('subtab-equipes-actuelles').style.display = subTabId === 'equipes-actuelles' ? '' : 'none';
  document.getElementById('subtab-creation-equipe').style.display = subTabId === 'creation-equipe' ? '' : 'none';

  if (subTabId === 'equipes-actuelles') {
    renderEquipesActuelles();
  } else {
    document.getElementById('equipe-create-form').reset();
    setMessage(document.getElementById('equipe-create-error'), '');
  }
}

async function renderEquipesActuelles() {
  const listEl = document.getElementById('equipes-list');
  listEl.innerHTML = '';

  const { data: { user } } = await client.auth.getUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  if (!profile || !profile.active_club_id) {
    listEl.innerHTML = '<li class="empty">Aucun club actif.</li>';
    return;
  }

  const { data: teams, error } = await client
    .from('teams')
    .select('id, nom, team_managers (user_id)')
    .eq('club_id', profile.active_club_id)
    .order('nom');

  if (error || !teams || !teams.length) {
    listEl.innerHTML = '<li class="empty">Aucune équipe pour l’instant.</li>';
    return;
  }

  const mine = [];
  const others = [];
  for (const team of teams) {
    const isMine = team.team_managers.some((m) => m.user_id === user.id);
    (isMine ? mine : others).push({ nom: team.nom, isMine });
  }

  for (const team of [...mine, ...others]) {
    const li = document.createElement('li');
    li.textContent = team.nom + (team.isMine ? ' (responsable)' : '');
    li.classList.toggle('highlight', team.isMine);
    listEl.appendChild(li);
  }
}

async function handleEquipeCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const nom = document.getElementById('equipe-create-nom').value.trim();
  const errorEl = document.getElementById('equipe-create-error');
  setMessage(errorEl, '');
  submitButton.disabled = true;

  try {
    const { data: { user } } = await client.auth.getUser();
    const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
    if (!profile || !profile.active_club_id) {
      setMessage(errorEl, 'Aucun club actif.', true);
      return;
    }

    const { data: team, error: createError } = await client
      .from('teams')
      .insert({ nom, club_id: profile.active_club_id, created_by: user.id })
      .select('id')
      .single();

    if (createError) {
      const message = createError.code === '23505'
        ? 'Une équipe porte déjà ce nom dans ce club.'
        : 'Erreur lors de la création de l’équipe.';
      setMessage(errorEl, message, true);
      return;
    }

    const { error: managerError } = await client
      .from('team_managers')
      .insert({ team_id: team.id, user_id: user.id });
    if (managerError) {
      setMessage(errorEl, 'Équipe créée, mais impossible de t’en attribuer la responsabilité.', true);
      return;
    }

    document.getElementById('equipe-create-form').reset();
    selectEquipeSubTab('equipes-actuelles');
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#tab-content-gestion-equipe .subtab-button').forEach((button) => {
    button.addEventListener('click', () => selectEquipeSubTab(button.dataset.subtab));
  });
  document.getElementById('equipe-create-form').addEventListener('submit', handleEquipeCreate);
});
