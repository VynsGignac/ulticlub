// ============================================================
// Fiche profil (lecture seule) d'un membre, ouverte en cliquant sur son nom depuis n'importe quelle
// liste de membres de l'app (equipe, club, evenements, dette...). Les champs email/telephone/
// adresse/date de naissance ne sont affiches que si leur case "visible par les membres hors du
// bureau" est cochee -- sauf pour un membre du bureau du club actif, qui voit toujours tout.
// Pas d'onglet dedie dans #app-tabs : s'ouvre en overlay par-dessus l'onglet courant (meme
// mecanique que js/communications.js), avec un bouton "Retour" qui y revient.
// ============================================================

let tabBeforeMemberProfile = null;
let pendingMemberProfileUserId = null;

// Utilise par les listes de membres dont le clic sur la ligne declenche deja une autre action
// (ajouter, valider, basculer un role...) : le nom reste cliquable pour voir le profil sans
// declencher cette action (stopPropagation), le reste de la ligne garde son comportement.
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

function openMemberProfile(userId) {
  tabBeforeMemberProfile = currentTabId;
  pendingMemberProfileUserId = userId;
  selectTab('member-profile');
}

function closeMemberProfile() {
  selectTab(tabBeforeMemberProfile || 'calendrier');
}

async function renderMemberProfileTab() {
  const contentEl = document.getElementById('member-profile-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const targetUserId = pendingMemberProfileUserId;
  const { data: { user } } = await client.auth.getUser();

  const [{ data: targetProfile }, { data: viewerProfile }] = await Promise.all([
    client
      .from('profiles')
      .select('pseudo, nom, prenom, email, telephone, adresse, date_naissance, visible_email, visible_telephone, visible_adresse, visible_date_naissance')
      .eq('id', targetUserId)
      .single(),
    client.from('profiles').select('active_club_id').eq('id', user.id).single(),
  ]);

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  if (!targetProfile) {
    const message = document.createElement('p');
    message.className = 'message';
    message.textContent = 'Profil introuvable.';
    wrapper.appendChild(message);
  } else {
    let isBureau = false;
    const clubId = viewerProfile ? viewerProfile.active_club_id : null;
    if (clubId) {
      const { data: membership } = await client
        .from('club_members')
        .select('role_membre_bureau')
        .eq('user_id', user.id)
        .eq('club_id', clubId)
        .single();
      isBureau = !!(membership && membership.role_membre_bureau);
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
  }

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', closeMemberProfile);
  wrapper.appendChild(backButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}
