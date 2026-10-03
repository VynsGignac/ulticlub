// ============================================================
// Onglet "Equipe" (accessible a tous les membres du club) : liste des equipes du club, celles dont
// le joueur est responsable d'abord, puis toutes les autres. La creation d'une equipe se fait cote
// bureau, depuis Gestion club (voir js/club-management.js). Cliquer sur une equipe ouvre son detail
// (voir js/team-detail.js) -- avec ou sans les outils de gestion selon qu'on en est responsable.
// ============================================================

function renderGestionEquipeTab() {
  renderEquipesActuelles();
}

async function renderEquipesActuelles() {
  const listEl = document.getElementById('equipes-list');
  listEl.innerHTML = '';

  const user = await requireUser();
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
    // Un responsable de CETTE equipe garde l'ancien ecran (onglet dedie avec panneau d'actions,
    // voir js/team-detail.js) -- ce que voient les responsables sera revu dans un second temps.
    // Les autres membres du club (lecture seule) ont la liste des joueurs dans la fenetre modale
    // partagee, en 2 colonnes comme Gestion membre/Evenement club.
    li.addEventListener('click', () => {
      if (team.isMine) {
        openTeamDetail(team.id, team.nom, profile.active_club_id);
      } else {
        openTeamMembersSplitView(team.id, team.nom);
      }
    });
    listEl.appendChild(li);
  }
}
