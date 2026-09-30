// ============================================================
// Onglet "Gestion equipe" (reserve aux encadrants du club actif) : liste des equipes du club,
// celles dont le joueur est responsable d'abord, puis toutes les autres. La creation d'une equipe
// se fait desormais cote bureau, depuis Gestion club (voir js/club-management.js).
// ============================================================

function renderGestionEquipeTab() {
  renderEquipesActuelles();
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
    (isMine ? mine : others).push({ id: team.id, nom: team.nom, isMine });
  }

  for (const team of [...mine, ...others]) {
    const li = document.createElement('li');
    li.textContent = team.nom + (team.isMine ? ' (responsable)' : '');
    li.classList.toggle('highlight', team.isMine);
    li.addEventListener('click', () => openTeamDetail(team.id, team.nom, profile.active_club_id));
    listEl.appendChild(li);
  }
}
