// ============================================================
// Onglet Bureau : 2 sous-onglets.
// - "Membre du bureau" : liste des membres du bureau du club actif -- des comptes de l'app
//   (club_members.role_membre_bureau = true), PAS la liste des licencies de l'onglet Administratif.
//   3 roles legaux (president/secretaire/tresorier), toujours attribues a exactement un membre
//   chacun (voir supabase/schema.sql, club_members_role_legal_unique) ; les autres sont de simples
//   "membres du bureau".
// - "Réunion bureau" : a venir.
//
// Seul le president peut :
// - transferer un role legal : cliquer sur un membre du bureau propose, UNIQUEMENT si le viewer
//   est lui-meme president, un bouton par role legal que ce membre ne detient pas encore ("Nommer
//   [x]"). L'operation retire d'abord le role a son titulaire actuel puis l'attribue au membre
//   choisi (jamais un simple retrait sans remplacement), pour que les 3 roles restent toujours
//   attribues ;
// - ajouter un membre du bureau, choisi parmi les licencies (comptes du club SANS role_membre_bureau
//   -- "Ajouter membre du bureau" bascule simplement ce flag, sans role legal) ;
// - retirer un membre du bureau (il redevient simple licencie) -- bouton propose uniquement pour un
//   membre SANS role legal : un titulaire d'un role legal doit d'abord en etre transfere (la base
//   l'empecherait de toute facon, voir club_members_role_legal_requires_bureau).
// Ces actions restent, comme bureau_uniquement/responsable_uniquement ailleurs dans ce projet, des
// restrictions cote interface uniquement -- la policy RLS reste large (tout le bureau peut modifier
// un membre), a durcir plus tard si besoin.
// ============================================================

const BUREAU_ROLE_LEGAL_LABELS = {
  president: 'Président',
  secretaire: 'Secrétaire',
  tresorier: 'Trésorier',
};
const BUREAU_ROLE_LEGAL_ORDER = { president: 0, secretaire: 1, tresorier: 2 };

let currentBureauClubId = null;
let currentBureauViewerIsPresident = false;

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
    document.getElementById('bureau-reunion-content').innerHTML = '<p class="message">Contenu à venir.</p>';
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

async function fetchBureauMembers() {
  const { data: members } = await client
    .from('club_members')
    .select('user_id, role_legal')
    .eq('club_id', currentBureauClubId)
    .eq('role_membre_bureau', true);

  const rows = members || [];
  const profileById = await fetchProfilesByIds(rows.map((m) => m.user_id));

  const combined = rows.map((m) => ({
    userId: m.user_id,
    roleLegal: m.role_legal,
    displayName: displayNameForProfile(profileById.get(m.user_id)),
  }));

  combined.sort((a, b) => {
    const ra = a.roleLegal ? BUREAU_ROLE_LEGAL_ORDER[a.roleLegal] : 3;
    const rb = b.roleLegal ? BUREAU_ROLE_LEGAL_ORDER[b.roleLegal] : 3;
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
  currentBureauViewerIsPresident = !!(mine && mine.roleLegal === 'president');

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
    const li = document.createElement('li');
    li.classList.toggle('highlight', !!member.roleLegal);

    const nameEl = document.createElement('span');
    nameEl.className = 'split-view-item-name';
    nameEl.textContent = member.displayName;
    li.appendChild(nameEl);

    if (member.roleLegal) {
      const tagEl = document.createElement('span');
      tagEl.className = 'split-view-item-meta';
      tagEl.textContent = BUREAU_ROLE_LEGAL_LABELS[member.roleLegal];
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

  const rolesToOffer = ['president', 'secretaire', 'tresorier'].filter((role) => member.roleLegal !== role);
  for (const role of rolesToOffer) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-button';
    button.textContent = `Nommer ${BUREAU_ROLE_LEGAL_LABELS[role]}`;
    button.addEventListener('click', () => handleTransferRoleLegal(role, member.userId));
    body.appendChild(button);
  }

  // Un titulaire d'un role legal doit d'abord en etre transfere avant de pouvoir etre retire du
  // bureau (la base l'empecherait de toute facon -- voir club_members_role_legal_requires_bureau).
  if (!member.roleLegal) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'link';
    removeButton.textContent = 'Retirer du bureau';
    removeButton.addEventListener('click', () => handleRemoveBureauMember(member));
    body.appendChild(removeButton);
  }
}

async function handleTransferRoleLegal(role, targetUserId) {
  // Retire d'abord le role a son titulaire actuel, PUIS l'attribue au membre choisi -- jamais
  // l'inverse, pour qu'il n'y ait jamais 2 titulaires en meme temps (contrainte d'unicite en base)
  // ni, le temps des 2 appels, un etat durablement incoherent.
  await client.from('club_members').update({ role_legal: null }).eq('club_id', currentBureauClubId).eq('role_legal', role);
  await client.from('club_members').update({ role_legal: role }).eq('club_id', currentBureauClubId).eq('user_id', targetUserId);
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

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#tab-content-bureau .subtab-button').forEach((button) => {
    button.addEventListener('click', () => selectBureauSubTab(button.dataset.subtab));
  });
});
