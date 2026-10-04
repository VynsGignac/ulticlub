// ============================================================
// Onglet "Vie de club" : liste des projets du club actif, crees par le bureau depuis le bouton
// "Projet" dans Gestion club (voir js/club-project-create.js) -- visible par TOUS les membres, pas
// seulement le bureau. Cliquer sur un projet ouvre son detail dans la fenetre modale partagee (voir
// js/modal.js), avec un bouton "Rejoindre" (ou "Quitter" si on en fait deja partie).
// ============================================================

async function fetchVieClubProjects() {
  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  const clubId = profile ? profile.active_club_id : null;
  if (!clubId) return [];

  const { data: projects } = await client
    .from('club_projects')
    .select('id, nom, commentaire, created_at')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  return projects || [];
}

async function renderVieClubTab() {
  const contentEl = document.getElementById('vie-club-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const projects = await fetchVieClubProjects();

  if (!projects.length) {
    contentEl.innerHTML = '<p class="message">Aucun projet pour l’instant.</p>';
    return;
  }

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  for (const project of projects) {
    const li = document.createElement('li');
    li.textContent = project.nom;
    li.addEventListener('click', () => openProjectDetail(project));
    listEl.appendChild(li);
  }

  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
}

function openProjectDetail(project) {
  showModal(project.nom);
  renderProjectDetailBody(project);
}

async function renderProjectDetailBody(project) {
  const body = document.getElementById('app-modal-body');
  body.innerHTML = '<p class="message">Chargement...</p>';

  const user = await requireUser();
  const [{ data: membership }, { count }] = await Promise.all([
    client.from('club_project_members').select('user_id').eq('project_id', project.id).eq('user_id', user.id).maybeSingle(),
    client.from('club_project_members').select('user_id', { count: 'exact', head: true }).eq('project_id', project.id),
  ]);
  const isMember = !!membership;

  body.innerHTML = '';

  if (project.commentaire) {
    const comment = document.createElement('p');
    comment.className = 'communication-body';
    comment.textContent = project.commentaire;
    body.appendChild(comment);
  }

  const summary = document.createElement('p');
  summary.className = 'communication-meta';
  const participantCount = count || 0;
  summary.textContent = `${participantCount} participant${participantCount > 1 ? 's' : ''}`;
  body.appendChild(summary);

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = 'action-button';
  actionButton.textContent = isMember ? 'Quitter' : 'Rejoindre';
  actionButton.addEventListener('click', async () => {
    if (isMember) {
      await client.from('club_project_members').delete().eq('project_id', project.id).eq('user_id', user.id);
    } else {
      await client.from('club_project_members').insert({ project_id: project.id, user_id: user.id });
    }
    renderProjectDetailBody(project);
  });
  body.appendChild(actionButton);
}
