// ============================================================
// Onglet "Vie de club" : liste des projets du club actif, crees par le bureau depuis le bouton
// "Projet" dans Gestion club (voir js/club-project-create.js) -- visible par TOUS les membres, pas
// seulement le bureau. Cliquer sur un projet ouvre son detail dans la fenetre modale partagee (voir
// js/modal.js) : nom (titre), commentaire, statut, liste des participants, puis le bouton
// "Rejoindre" (ou "Quitter" si on en fait deja partie). Une fois le projet rejoint, n'importe quel
// participant peut modifier le commentaire et faire evoluer le statut -- pas reserve au bureau (voir
// la policy RLS sur club_projects, basee sur l'appartenance a club_project_members).
// ============================================================

const PROJECT_STATUTS = ['Non démarré', 'Amorcé', 'En cours', 'Terminé'];

async function fetchVieClubProjects() {
  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  const clubId = profile ? profile.active_club_id : null;
  if (!clubId) return [];

  const { data: projects } = await client
    .from('club_projects')
    .select('id, nom, commentaire, statut, created_at')
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
  const [{ data: membership }, { data: members }] = await Promise.all([
    client.from('club_project_members').select('user_id').eq('project_id', project.id).eq('user_id', user.id).maybeSingle(),
    client.from('club_project_members').select('user_id').eq('project_id', project.id),
  ]);
  const isMember = !!membership;
  const participantIds = (members || []).map((m) => m.user_id);
  const pseudoById = await fetchPseudosByIdForClub(participantIds);

  body.innerHTML = '';

  // Commentaire : texte simple pour un non-participant, editable (textarea + bouton) pour un
  // participant -- modifier le commentaire est ouvert a tout membre du projet, pas seulement au
  // bureau qui l'a cree (voir la policy RLS sur club_projects).
  if (isMember) {
    const commentLabel = document.createElement('label');
    commentLabel.textContent = 'Commentaire';
    const commentArea = document.createElement('textarea');
    commentArea.id = 'project-detail-commentaire';
    commentArea.rows = 4;
    commentArea.value = project.commentaire || '';
    commentLabel.appendChild(commentArea);
    body.appendChild(commentLabel);

    const saveCommentButton = document.createElement('button');
    saveCommentButton.type = 'button';
    saveCommentButton.className = 'action-button';
    saveCommentButton.textContent = 'Enregistrer le commentaire';
    saveCommentButton.addEventListener('click', async () => {
      const newCommentaire = commentArea.value.trim() || null;
      await client.from('club_projects').update({ commentaire: newCommentaire }).eq('id', project.id);
      project.commentaire = newCommentaire;
      renderProjectDetailBody(project);
    });
    body.appendChild(saveCommentButton);
  } else if (project.commentaire) {
    const comment = document.createElement('p');
    comment.className = 'communication-body';
    comment.textContent = project.commentaire;
    body.appendChild(comment);
  }

  // Statut : modifiable par tout participant (select, sauvegarde immediate au changement) ; simple
  // texte pour un non-participant.
  if (isMember) {
    const statutLabel = document.createElement('label');
    statutLabel.textContent = 'Statut';
    const statutSelect = document.createElement('select');
    statutSelect.id = 'project-detail-statut';
    for (const value of PROJECT_STATUTS) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.selected = value === project.statut;
      statutSelect.appendChild(option);
    }
    statutSelect.addEventListener('change', async () => {
      const newStatut = statutSelect.value;
      await client.from('club_projects').update({ statut: newStatut }).eq('id', project.id);
      project.statut = newStatut;
      renderProjectDetailBody(project);
    });
    statutLabel.appendChild(statutSelect);
    body.appendChild(statutLabel);
  } else {
    const statutP = document.createElement('p');
    statutP.className = 'communication-meta';
    statutP.textContent = `Statut : ${project.statut || PROJECT_STATUTS[0]}`;
    body.appendChild(statutP);
  }

  const participantsTitle = document.createElement('p');
  participantsTitle.className = 'communication-meta';
  participantsTitle.textContent = `Participants (${participantIds.length})`;
  body.appendChild(participantsTitle);

  const listEl = document.createElement('ul');
  listEl.className = 'detail-member-list';
  if (!participantIds.length) {
    listEl.innerHTML = '<li class="empty">Aucun participant pour l’instant.</li>';
  } else {
    for (const participantId of participantIds) {
      const li = document.createElement('li');
      li.textContent = pseudoById.get(participantId) || 'Inconnu';
      listEl.appendChild(li);
    }
  }
  body.appendChild(listEl);

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
