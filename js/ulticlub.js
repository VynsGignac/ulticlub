// ============================================================
// Onglet Ulticlub (reserve au role "membre du bureau") : administration des comptes du club actif.
// - Valide les admissions en attente (club_members.valide, meme flag que l'ancien ecran "Gestion
//   club" -- voir js/club-management.js, desormais inaccessible depuis la barre).
// - Liste TOUS les comptes membres du club (valides ou non) ; cliquer sur le nom ouvre la fiche
//   profil en lecture seule (voir js/member-profile.js), cliquer ailleurs sur la ligne ouvre les
//   actions (Valider/Supprimer).
// - Supprime un compte DU CLUB si besoin : retire sa ligne club_members (il redevient un compte
//   ordinaire sans appartenance a ce club, comme s'il l'avait quitte lui-meme -- voir "Quitter" dans
//   js/profile.js). Le compte/profil lui-meme et ses eventuelles appartenances a d'autres clubs ne
//   sont pas touches -- cette app utilise uniquement la cle anonyme Supabase cote client, qui ne
//   permet pas de supprimer un compte Auth a proprement parler (reserve a la cle service_role,
//   cote serveur).
// ============================================================

let currentUlticlubClubId = null;

async function fetchUlticlubProfilesByIds(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await client.from('profiles').select('id, pseudo, nom, prenom').in('id', userIds);
  return new Map((data || []).map((p) => [p.id, p]));
}

function displayNameForUlticlubProfile(profile) {
  if (!profile) return 'Inconnu';
  return [profile.prenom, profile.nom].filter(Boolean).join(' ') || profile.pseudo;
}

async function renderUlticlubTab() {
  const contentEl = document.getElementById('ulticlub-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  currentUlticlubClubId = profile ? profile.active_club_id : null;

  if (!currentUlticlubClubId) {
    contentEl.innerHTML = '<p class="message">Aucun club actif.</p>';
    return;
  }

  const { data: members } = await client.from('club_members').select('user_id, valide').eq('club_id', currentUlticlubClubId);
  const rows = members || [];
  const profileById = await fetchUlticlubProfilesByIds(rows.map((m) => m.user_id));

  const combined = rows.map((m) => ({
    userId: m.user_id,
    valide: m.valide,
    displayName: displayNameForUlticlubProfile(profileById.get(m.user_id)),
  }));

  // Les admissions en attente (qui demandent une action) d'abord, ordre alphabetique ensuite.
  combined.sort((a, b) => {
    if (a.valide !== b.valide) return a.valide ? 1 : -1;
    return a.displayName.localeCompare(b.displayName);
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide';

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  renderUlticlubListInto(listEl, combined);
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function renderUlticlubListInto(listEl, members) {
  listEl.innerHTML = '';

  if (!members.length) {
    listEl.innerHTML = '<li class="empty">Aucun compte pour l’instant.</li>';
    return;
  }

  for (const member of members) {
    const li = document.createElement('li');
    li.classList.toggle('highlight', !member.valide);

    li.appendChild(createMemberNameElement(member.userId, member.displayName));

    if (!member.valide) {
      const tagEl = document.createElement('span');
      tagEl.className = 'split-view-item-meta';
      tagEl.textContent = 'Admission en attente';
      li.appendChild(tagEl);
    }

    li.addEventListener('click', () => openUlticlubMemberActions(member));
    listEl.appendChild(li);
  }
}

function openUlticlubMemberActions(member) {
  const body = showModal(member.displayName);
  body.innerHTML = '';

  if (!member.valide) {
    const validateButton = document.createElement('button');
    validateButton.type = 'button';
    validateButton.className = 'action-button';
    validateButton.textContent = 'Valider l’admission';
    validateButton.addEventListener('click', () => handleValidateUlticlubMember(member));
    body.appendChild(validateButton);
  }

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'link';
  removeButton.textContent = 'Supprimer ce compte du club';
  removeButton.addEventListener('click', () => handleRemoveUlticlubMember(member));
  body.appendChild(removeButton);
}

async function handleValidateUlticlubMember(member) {
  await client.from('club_members').update({ valide: true }).eq('club_id', currentUlticlubClubId).eq('user_id', member.userId);
  closeModal();
  renderUlticlubTab();
}

async function handleRemoveUlticlubMember(member) {
  if (!confirm(`Supprimer ${member.displayName} de ce club ?`)) return;

  await client.from('club_members').delete().eq('club_id', currentUlticlubClubId).eq('user_id', member.userId);
  closeModal();
  renderUlticlubTab();
}
