// ============================================================
// Fiche profil (lecture seule) d'un membre, ouverte en cliquant sur son nom depuis n'importe quelle
// liste de membres de l'app (equipe, club, evenements, dette...). Les champs email/telephone/
// adresse/date de naissance ne sont affiches que si leur case "visible par les membres hors du
// bureau" est cochee -- sauf pour un membre du bureau du club actif, qui voit toujours tout.
// S'affiche dans la fenetre modale partagee (voir js/modal.js), pas dans un onglet dedie. Le bouton
// "Retour" revient a l'ecran precedent : s'il s'agissait d'une liste affichee dans la meme fenetre
// (ex. Gestion membre), passer cette liste en second argument de openMemberProfile() pour y revenir
// directement ; sinon la fenetre se ferme simplement.
// ============================================================

let memberProfileReturnFn = null;

// Utilise par les listes de membres dont le clic sur la ligne declenche deja une autre action
// (ajouter, valider, basculer un role...) : le nom reste cliquable pour voir le profil sans
// declencher cette action (stopPropagation), le reste de la ligne garde son comportement. Ces
// listes n'ont pas connaissance de leur propre fonction de rendu ici, donc pas de "retour a la
// liste" dans ce cas precis -- Retour ferme simplement la fenetre.
function createMemberNameElement(userId, label) {
  const span = document.createElement('span');
  span.textContent = label;
  span.className = 'member-name-link';
  span.addEventListener('click', (event) => {
    event.stopPropagation();
    openMemberProfile(userId);
  });
  return span;
}

function openMemberProfile(userId, returnFn) {
  memberProfileReturnFn = typeof returnFn === 'function' ? returnFn : null;
  renderMemberProfile(userId);
}

function closeMemberProfile() {
  if (memberProfileReturnFn) {
    memberProfileReturnFn();
  } else {
    closeModal();
  }
}

// Roles d'un membre (bureau, administrateur, responsable d'equipe -- avec la ou les equipes
// concernees) dans un club donne. Partage par TOUS les endroits qui affichent le profil d'un
// membre (fiche plein ecran ci-dessous, volet de detail de Gestion membre, liste des joueurs d'une
// equipe...) pour que ces roles restent coherents partout, pas juste dans Gestion membre.
async function fetchMemberRoleLabels(targetUserId, clubId) {
  if (!clubId) return [];

  const [{ data: membership }, { data: targetProfile }, { data: teams }] = await Promise.all([
    client.from('club_members').select('role_membre_bureau').eq('user_id', targetUserId).eq('club_id', clubId).maybeSingle(),
    client.from('profiles').select('is_admin').eq('id', targetUserId).single(),
    client.from('teams').select('id, nom').eq('club_id', clubId),
  ]);

  const roleLabels = [];
  if (membership && membership.role_membre_bureau) roleLabels.push('Membre du bureau');
  if (targetProfile && targetProfile.is_admin) roleLabels.push('Administrateur');

  const teamIds = (teams || []).map((t) => t.id);
  if (teamIds.length) {
    const { data: managerRows } = await client.from('team_managers').select('team_id').eq('user_id', targetUserId).in('team_id', teamIds);
    const teamNameById = new Map((teams || []).map((t) => [t.id, t.nom]));
    const managedNames = (managerRows || []).map((r) => teamNameById.get(r.team_id)).filter(Boolean);
    if (managedNames.length) roleLabels.push(`Responsable d’équipe (${managedNames.join(', ')})`);
  }

  return roleLabels;
}

// Ajoute, si non vide, le titre "Rôle :" suivi d'une liste a puces (un element par role) -- meme
// presentation partout (Gestion membre, fiche profil, liste des joueurs d'une equipe...).
function appendRoleListEl(container, roleLabels) {
  if (!roleLabels.length) return;

  const heading = document.createElement('p');
  heading.className = 'communication-meta';
  heading.textContent = 'Rôle :';
  container.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'role-list';
  for (const label of roleLabels) {
    const li = document.createElement('li');
    li.textContent = label;
    list.appendChild(li);
  }
  container.appendChild(list);
}

// Recupere le profil d'un membre, determine si le viewer (l'utilisateur connecte) est membre du
// bureau de son club actif (qui voit alors tous les champs, meme ceux marques non visibles), et ses
// roles dans ce meme club. Partage entre la fiche profil plein ecran ci-dessous et tous les volets
// de detail qui integrent ces memes informations sans ouvrir un autre ecran (Gestion membre, liste
// des joueurs d'une equipe...).
async function fetchMemberProfileData(targetUserId) {
  const user = await requireUser();

  const [{ data: targetProfile }, { data: viewerProfile }] = await Promise.all([
    client
      .from('profiles')
      .select('pseudo, nom, prenom, email, telephone, adresse, date_naissance, visible_email, visible_telephone, visible_adresse, visible_date_naissance, is_admin')
      .eq('id', targetUserId)
      .single(),
    client.from('profiles').select('active_club_id').eq('id', user.id).single(),
  ]);

  const clubId = viewerProfile ? viewerProfile.active_club_id : null;

  let isBureau = false;
  if (clubId) {
    const { data: membership } = await client
      .from('club_members')
      .select('role_membre_bureau')
      .eq('user_id', user.id)
      .eq('club_id', clubId)
      .single();
    isBureau = !!(membership && membership.role_membre_bureau);
  }

  const roleLabels = await fetchMemberRoleLabels(targetUserId, clubId);

  return { targetProfile, isBureau, roleLabels };
}

function buildMemberProfileFieldsEl(targetProfile, isBureau) {
  const wrapper = document.createElement('div');

  if (!targetProfile) {
    const message = document.createElement('p');
    message.className = 'message';
    message.textContent = 'Profil introuvable.';
    wrapper.appendChild(message);
    return wrapper;
  }

  const title = document.createElement('h2');
  title.textContent = [targetProfile.prenom, targetProfile.nom].filter(Boolean).join(' ') || targetProfile.pseudo;
  wrapper.appendChild(title);

  const pseudoLine = document.createElement('p');
  pseudoLine.className = 'communication-meta';
  pseudoLine.textContent = `Pseudo : ${targetProfile.pseudo}`;
  wrapper.appendChild(pseudoLine);

  const addField = (label, value, allowed) => {
    if (!allowed || !value) return;
    const p = document.createElement('p');
    p.className = 'communication-meta';
    p.textContent = `${label} : ${value}`;
    wrapper.appendChild(p);
  };

  addField('Adresse mail', targetProfile.email, isBureau || targetProfile.visible_email !== false);
  addField('Téléphone', targetProfile.telephone, isBureau || targetProfile.visible_telephone !== false);
  addField('Adresse', targetProfile.adresse, isBureau || targetProfile.visible_adresse !== false);
  addField('Date de naissance', targetProfile.date_naissance, isBureau || targetProfile.visible_date_naissance !== false);

  return wrapper;
}

async function renderMemberProfile(targetUserId) {
  const contentEl = showModal('Profil');

  const { targetProfile, isBureau, roleLabels } = await fetchMemberProfileData(targetUserId);

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';
  wrapper.appendChild(buildMemberProfileFieldsEl(targetProfile, isBureau));
  appendRoleListEl(wrapper, roleLabels);

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', closeMemberProfile);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}
