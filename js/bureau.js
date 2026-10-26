// ============================================================
// Onglet Bureau : sous-onglet "Membre du bureau" (le seul pour l'instant), liste des membres du
// bureau du club actif -- des comptes de l'app (club_members.role_membre_bureau = true), PAS la
// liste des licencies de l'onglet Administratif. 3 roles legaux (president/secretaire/tresorier),
// toujours attribues a exactement un membre chacun (voir supabase/schema.sql,
// club_members_role_legal_unique) ; les autres sont de simples "membres du bureau".
//
// Seul le president peut transferer un role legal : cliquer sur un membre du bureau propose,
// uniquement si le viewer est lui-meme president, un bouton par role legal que ce membre ne
// detient pas encore ("Nommer [x] president/secretaire/tresorier"). L'operation retire d'abord le
// role a son titulaire actuel puis l'attribue au membre choisi (jamais un simple retrait sans
// remplacement), pour que les 3 roles restent toujours attribues.
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

  if (subTabId === 'membres-bureau') {
    renderBureauMembresSubTab();
  }
}

async function fetchBureauMembers() {
  const { data: members } = await client
    .from('club_members')
    .select('user_id, role_legal')
    .eq('club_id', currentBureauClubId)
    .eq('role_membre_bureau', true);

  const rows = members || [];
  const userIds = rows.map((m) => m.user_id);
  const { data: profilesData } = userIds.length
    ? await client.from('profiles').select('id, pseudo, nom, prenom').in('id', userIds)
    : { data: [] };
  const profileById = new Map((profilesData || []).map((p) => [p.id, p]));

  const combined = rows.map((m) => {
    const profile = profileById.get(m.user_id);
    const displayName = profile ? ([profile.prenom, profile.nom].filter(Boolean).join(' ') || profile.pseudo) : 'Inconnu';
    return { userId: m.user_id, roleLegal: m.role_legal, displayName };
  });

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

  renderBureauMembersListInto(contentEl, members);
}

function renderBureauMembersListInto(contentEl, members) {
  const listEl = document.createElement('ul');
  listEl.className = 'club-results';

  if (!members.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre du bureau pour l’instant.</li>';
  } else {
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

  contentEl.innerHTML = '';
  contentEl.appendChild(listEl);
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

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#tab-content-bureau .subtab-button').forEach((button) => {
    button.addEventListener('click', () => selectBureauSubTab(button.dataset.subtab));
  });
});
