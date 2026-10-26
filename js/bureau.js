// ============================================================
// Onglet Bureau : 2 sous-onglets.
// - "Membre du bureau" : liste des membres du bureau du club actif -- des comptes de l'app
//   (club_members.role_membre_bureau = true), PAS la liste des licencies de l'onglet Administratif.
//   3 roles legaux (president/secretaire/tresorier), CUMULATIFS (un meme membre peut cumuler les 3,
//   voir supabase/schema.sql -- role_president/role_secretaire/role_tresorier, 3 colonnes
//   booleennes independantes plutot qu'une seule valeur) ; les autres sont de simples "membres du
//   bureau" (aucun des 3 a true).
// - "Réunion bureau" : liste tous les projets (toutes commissions confondues, table club_initiatives
//   -- voir js/club-initiatives.js) portant une "Demande bureau" non vide, affichee ici en LECTURE
//   SEULE, avec en face un champ libre "Décision bureau" -- le seul endroit ou ce champ est
//   editable (ailleurs, ex. le formulaire de projet de Sport/Kid/Vie Associative, il n'est que
//   consulte). Edition reservee aux membres du bureau, cote interface uniquement (comme les autres
//   restrictions bureau_uniquement de ce projet) -- la policy RLS de club_initiatives reste large
//   (tout membre du club peut modifier un projet), a durcir plus tard si besoin.
//
// Seul le president peut :
// - transferer un role legal : cliquer sur un membre du bureau propose, UNIQUEMENT si le viewer
//   est lui-meme president, un bouton par role legal que ce membre ne detient pas encore ("Nommer
//   [x]"). L'operation retire d'abord le role a son titulaire actuel puis l'attribue au membre
//   choisi SANS TOUCHER A SES AUTRES ROLES (chaque role est une colonne a part) -- jamais un simple
//   retrait sans remplacement, et jamais de perte collaterale d'un autre role deja detenu par le
//   nouveau titulaire. Les 3 roles restent donc toujours attribues ;
// - ajouter un membre du bureau, choisi parmi les licencies (comptes du club SANS role_membre_bureau
//   -- "Ajouter membre du bureau" bascule simplement ce flag, sans role legal) ;
// - retirer un membre du bureau (il redevient simple licencie) -- bouton propose uniquement pour un
//   membre SANS AUCUN role legal : un titulaire d'au moins un role legal doit d'abord en etre
//   transfere (la base l'empecherait de toute facon, voir
//   club_members_roles_legaux_requierent_bureau).
// Ces actions restent, comme bureau_uniquement/responsable_uniquement ailleurs dans ce projet, des
// restrictions cote interface uniquement -- la policy RLS reste large (tout le bureau peut modifier
// un membre), a durcir plus tard si besoin.
// ============================================================

// role (cle logique utilisee cote JS) -> nom de la colonne booleenne correspondante en base
// (utilise pour les requetes Supabase, en snake_case comme la base).
const BUREAU_ROLE_COLUMNS = {
  president: 'role_president',
  secretaire: 'role_secretaire',
  tresorier: 'role_tresorier',
};
// role -> nom de la propriete correspondante sur les objets "membre" en memoire cote JS (voir
// fetchBureauMembers, camelCase par convention JS -- DIFFERENT du nom de colonne ci-dessus).
const BUREAU_ROLE_PROPERTIES = {
  president: 'rolePresident',
  secretaire: 'roleSecretaire',
  tresorier: 'roleTresorier',
};
const BUREAU_ROLE_LEGAL_LABELS = {
  president: 'Président',
  secretaire: 'Secrétaire',
  tresorier: 'Trésorier',
};
const BUREAU_ROLE_LEGAL_ORDER = { president: 0, secretaire: 1, tresorier: 2 };

let currentBureauClubId = null;
let currentBureauViewerIsPresident = false;
let currentBureauViewerIsBureauMember = false;

function renderBureauTab() {
  selectBureauSubTab('membres-bureau');
}

function selectBureauSubTab(subTabId) {
  document.querySelectorAll('#tab-content-bureau .subtab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.subtab === subTabId);
  });
  document.getElementById('bureau-subtab-membres-bureau').style.display = subTabId === 'membres-bureau' ? '' : 'none';
  document.getElementById('bureau-subtab-reunion-bureau').style.display = subTabId === 'reunion-bureau' ? '' : 'none';

  if (subTabId === 'membres-bureau') {
    renderBureauMembresSubTab();
  } else {
    renderBureauReunionSubTab();
  }
}

async function fetchProfilesByIds(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await client.from('profiles').select('id, pseudo, nom, prenom').in('id', userIds);
  return new Map((data || []).map((p) => [p.id, p]));
}

function displayNameForProfile(profile) {
  if (!profile) return 'Inconnu';
  return [profile.prenom, profile.nom].filter(Boolean).join(' ') || profile.pseudo;
}

// Roles detenus par un membre, sous forme de tableau de cles logiques ('president', 'secretaire',
// 'tresorier'), dans cet ordre -- peut en contenir 0, 1, 2 ou les 3 (roles cumulatifs).
function rolesHeldBy(member) {
  return ['president', 'secretaire', 'tresorier'].filter((role) => member[BUREAU_ROLE_PROPERTIES[role]]);
}

async function fetchBureauMembers() {
  const { data: members } = await client
    .from('club_members')
    .select('user_id, role_president, role_secretaire, role_tresorier')
    .eq('club_id', currentBureauClubId)
    .eq('role_membre_bureau', true);

  const rows = members || [];
  const profileById = await fetchProfilesByIds(rows.map((m) => m.user_id));

  const combined = rows.map((m) => ({
    userId: m.user_id,
    rolePresident: m.role_president,
    roleSecretaire: m.role_secretaire,
    roleTresorier: m.role_tresorier,
    displayName: displayNameForProfile(profileById.get(m.user_id)),
  }));

  combined.sort((a, b) => {
    const rolesA = rolesHeldBy(a);
    const rolesB = rolesHeldBy(b);
    // Classe par le role le "plus haut" detenu (president avant secretaire avant tresorier avant
    // aucun) -- un membre cumulant plusieurs roles se classe sur le plus prioritaire d'entre eux.
    const ra = rolesA.length ? BUREAU_ROLE_LEGAL_ORDER[rolesA[0]] : 3;
    const rb = rolesB.length ? BUREAU_ROLE_LEGAL_ORDER[rolesB[0]] : 3;
    if (ra !== rb) return ra - rb;
    return a.displayName.localeCompare(b.displayName);
  });

  return combined;
}

async function renderBureauMembresSubTab() {
  const contentEl = document.getElementById('bureau-membres-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  currentBureauClubId = profile ? profile.active_club_id : null;

  if (!currentBureauClubId) {
    contentEl.innerHTML = '<p class="message">Aucun club actif.</p>';
    return;
  }

  const members = await fetchBureauMembers();
  const mine = members.find((m) => m.userId === user.id);
  currentBureauViewerIsPresident = !!(mine && mine.rolePresident);
  currentBureauViewerIsBureauMember = !!mine;

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide';

  if (currentBureauViewerIsPresident) {
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'action-button';
    addButton.textContent = 'Ajouter membre du bureau';
    addButton.addEventListener('click', openBureauMemberPicker);
    wrapper.appendChild(addButton);
  }

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  renderBureauMembersListInto(listEl, members);
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function renderBureauMembersListInto(listEl, members) {
  listEl.innerHTML = '';

  if (!members.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre du bureau pour l’instant.</li>';
    return;
  }

  for (const member of members) {
    const roles = rolesHeldBy(member);
    const li = document.createElement('li');
    li.classList.toggle('highlight', roles.length > 0);

    const nameEl = document.createElement('span');
    nameEl.className = 'split-view-item-name';
    nameEl.textContent = member.displayName;
    li.appendChild(nameEl);

    if (roles.length) {
      const tagEl = document.createElement('span');
      tagEl.className = 'split-view-item-meta';
      tagEl.textContent = roles.map((role) => BUREAU_ROLE_LEGAL_LABELS[role]).join(' · ');
      li.appendChild(tagEl);
    }

    if (currentBureauViewerIsPresident) {
      li.addEventListener('click', () => openBureauMemberActions(member));
    } else {
      li.style.cursor = 'default';
    }

    listEl.appendChild(li);
  }
}

function openBureauMemberActions(member) {
  const body = showModal(member.displayName);
  body.innerHTML = '';

  const heldRoles = rolesHeldBy(member);
  const rolesToOffer = ['president', 'secretaire', 'tresorier'].filter((role) => !heldRoles.includes(role));
  for (const role of rolesToOffer) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-button';
    button.textContent = `Nommer ${BUREAU_ROLE_LEGAL_LABELS[role]}`;
    button.addEventListener('click', () => handleTransferRoleLegal(role, member.userId));
    body.appendChild(button);
  }

  // Un titulaire d'au moins un role legal doit d'abord en etre transfere avant de pouvoir etre
  // retire du bureau (la base l'empecherait de toute facon -- voir
  // club_members_roles_legaux_requierent_bureau).
  if (!heldRoles.length) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'link';
    removeButton.textContent = 'Retirer du bureau';
    removeButton.addEventListener('click', () => handleRemoveBureauMember(member));
    body.appendChild(removeButton);
  }
}

async function handleTransferRoleLegal(role, targetUserId) {
  const column = BUREAU_ROLE_COLUMNS[role];
  // Retire d'abord le role a son titulaire actuel, PUIS l'attribue au membre choisi -- jamais
  // l'inverse, pour qu'il n'y ait jamais 2 titulaires en meme temps (contrainte d'unicite en base).
  // Chaque role a sa propre colonne : cette operation ne touche JAMAIS aux autres roles deja
  // detenus par le nouveau titulaire (c'est precisement ce qui causait la perte silencieuse d'un
  // role avec l'ancienne colonne unique role_legal).
  await client.from('club_members').update({ [column]: false }).eq('club_id', currentBureauClubId).eq(column, true);
  await client.from('club_members').update({ [column]: true }).eq('club_id', currentBureauClubId).eq('user_id', targetUserId);
  closeModal();
  renderBureauMembresSubTab();
}

async function handleRemoveBureauMember(member) {
  if (!confirm(`Retirer ${member.displayName} du bureau ?`)) return;

  await client.from('club_members').update({ role_membre_bureau: false }).eq('club_id', currentBureauClubId).eq('user_id', member.userId);
  closeModal();
  renderBureauMembresSubTab();
}

async function openBureauMemberPicker() {
  const body = showModal('Ajouter un membre du bureau');
  body.innerHTML = '<p class="message">Chargement...</p>';

  const { data: members } = await client
    .from('club_members')
    .select('user_id')
    .eq('club_id', currentBureauClubId)
    .eq('role_membre_bureau', false);

  const rows = members || [];
  const profileById = await fetchProfilesByIds(rows.map((m) => m.user_id));
  const candidates = rows
    .map((m) => ({ userId: m.user_id, displayName: displayNameForProfile(profileById.get(m.user_id)) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!candidates.length) {
    listEl.innerHTML = '<li class="empty">Aucun licencié disponible.</li>';
  } else {
    for (const candidate of candidates) {
      const li = document.createElement('li');
      li.textContent = candidate.displayName;
      li.addEventListener('click', () => handleAddBureauMember(candidate.userId));
      listEl.appendChild(li);
    }
  }

  body.innerHTML = '';
  body.appendChild(listEl);
}

async function handleAddBureauMember(userId) {
  await client.from('club_members').update({ role_membre_bureau: true }).eq('club_id', currentBureauClubId).eq('user_id', userId);
  closeModal();
  renderBureauMembresSubTab();
}

// --- Sous-onglet "Réunion bureau" ---------------------------------------------------------------

async function renderBureauReunionSubTab() {
  const contentEl = document.getElementById('bureau-reunion-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  if (!currentBureauClubId) {
    const user = await requireUser();
    const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
    currentBureauClubId = profile ? profile.active_club_id : null;
  }

  if (!currentBureauClubId) {
    contentEl.innerHTML = '<p class="message">Aucun club actif.</p>';
    return;
  }

  const { data: initiatives } = await client
    .from('club_initiatives')
    .select('id, domaine, nom, echeance, demande_bureau, decision_bureau')
    .eq('club_id', currentBureauClubId)
    .order('echeance', { ascending: true });

  // Seuls les projets ayant effectivement une demande a transmettre au bureau apparaissent ici.
  const withDemande = (initiatives || []).filter((i) => (i.demande_bureau || '').trim());

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide';

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  renderBureauReunionListInto(listEl, withDemande);
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function renderBureauReunionListInto(listEl, initiatives) {
  listEl.innerHTML = '';

  if (!initiatives.length) {
    listEl.innerHTML = '<li class="empty">Aucune demande bureau pour l’instant.</li>';
    return;
  }

  for (const initiative of initiatives) {
    const li = document.createElement('li');
    li.style.cursor = 'default';

    const nameEl = document.createElement('strong');
    nameEl.textContent = initiative.nom;
    li.appendChild(nameEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'communication-meta';
    metaEl.textContent = CLUB_INITIATIVE_DOMAINE_LABELS[initiative.domaine] || initiative.domaine;
    li.appendChild(metaEl);

    const demandeEl = document.createElement('div');
    demandeEl.className = 'communication-body';
    demandeEl.textContent = `Demande : ${initiative.demande_bureau}`;
    li.appendChild(demandeEl);

    const decisionLabel = document.createElement('label');
    decisionLabel.textContent = 'Décision bureau';
    const decisionArea = document.createElement('textarea');
    decisionArea.rows = 3;
    decisionArea.value = initiative.decision_bureau || '';
    decisionArea.readOnly = !currentBureauViewerIsBureauMember;
    if (!currentBureauViewerIsBureauMember) decisionArea.placeholder = 'Aucune décision pour le moment.';
    decisionLabel.appendChild(decisionArea);
    li.appendChild(decisionLabel);

    if (currentBureauViewerIsBureauMember) {
      const infoEl = document.createElement('p');
      infoEl.className = 'message';

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'action-button';
      saveButton.textContent = 'Enregistrer';
      saveButton.addEventListener('click', async () => {
        saveButton.disabled = true;
        await client.from('club_initiatives').update({ decision_bureau: decisionArea.value.trim() || null }).eq('id', initiative.id);
        saveButton.disabled = false;
        setMessage(infoEl, 'Décision enregistrée.');
      });
      li.appendChild(saveButton);
      li.appendChild(infoEl);
    }

    listEl.appendChild(li);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#tab-content-bureau .subtab-button').forEach((button) => {
    button.addEventListener('click', () => selectBureauSubTab(button.dataset.subtab));
  });
});
