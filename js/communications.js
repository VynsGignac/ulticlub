// ============================================================
// Communications du club actif : accessibles depuis n'importe quel onglet via l'icone flottante
// "communications-fab" (voir index.html), ou depuis le bouton "Communication" de Gestion club.
// Visibles par TOUS les membres du club (voir RLS sur club_communications), mais seul le bureau
// peut en publier une nouvelle -- le bouton "Nouvelle communication" est masque pour les autres.
// ============================================================

let currentCommunicationsClubId = null;
let isCurrentUserClubBureau = false;
let tabBeforeCommunications = null;

function openCommunications() {
  tabBeforeCommunications = currentTabId;
  selectTab('communications');
}

function closeCommunications() {
  selectTab(tabBeforeCommunications || 'calendrier');
}

async function fetchPseudosByIdForCommunications(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await client.from('profiles').select('id, pseudo').in('id', userIds);
  return new Map((data || []).map((p) => [p.id, p.pseudo]));
}

async function renderCommunicationsTab() {
  const { data: { user } } = await client.auth.getUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  currentCommunicationsClubId = profile ? profile.active_club_id : null;

  const { data: membership } = await client
    .from('club_members')
    .select('role_membre_bureau')
    .eq('user_id', user.id)
    .eq('club_id', currentCommunicationsClubId)
    .single();
  isCurrentUserClubBureau = !!(membership && membership.role_membre_bureau);

  await renderCommunicationsList();
}

async function renderCommunicationsList() {
  const contentEl = document.getElementById('communications-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const { data: communications } = await client
    .from('club_communications')
    .select('id, message, created_by, created_at')
    .eq('club_id', currentCommunicationsClubId)
    .order('created_at', { ascending: false });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  if (isCurrentUserClubBureau) {
    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'action-button';
    newButton.textContent = 'Nouvelle communication';
    newButton.addEventListener('click', renderNewCommunicationForm);
    wrapper.appendChild(newButton);
  }

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';

  if (!communications || !communications.length) {
    listEl.innerHTML = '<li class="empty">Aucune communication pour l’instant.</li>';
  } else {
    const authorIds = [...new Set(communications.map((c) => c.created_by))];
    const pseudoById = await fetchPseudosByIdForCommunications(authorIds);

    for (const comm of communications) {
      const li = document.createElement('li');
      const preview = comm.message.length > 60 ? `${comm.message.slice(0, 60)}…` : comm.message;
      const date = new Date(comm.created_at).toLocaleDateString('fr-FR');
      li.textContent = `${date} — ${preview}`;
      li.addEventListener('click', () => renderCommunicationDetail(comm, pseudoById.get(comm.created_by)));
      listEl.appendChild(li);
    }
  }

  wrapper.appendChild(listEl);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'link';
  closeButton.textContent = 'Fermer';
  closeButton.addEventListener('click', closeCommunications);
  wrapper.appendChild(closeButton);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function renderCommunicationDetail(comm, authorPseudo) {
  const contentEl = document.getElementById('communications-content');
  const date = new Date(comm.created_at).toLocaleString('fr-FR');

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const meta = document.createElement('p');
  meta.className = 'communication-meta';
  meta.textContent = `${authorPseudo || 'Inconnu'} — ${date}`;

  const body = document.createElement('p');
  body.className = 'communication-body';
  body.textContent = comm.message;

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'link';
  backButton.textContent = 'Retour';
  backButton.addEventListener('click', renderCommunicationsList);

  wrapper.appendChild(meta);
  wrapper.appendChild(body);
  wrapper.appendChild(backButton);
  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function renderNewCommunicationForm() {
  const contentEl = document.getElementById('communications-content');

  const form = document.createElement('form');
  form.className = 'panel';

  const label = document.createElement('label');
  label.textContent = 'Message';
  const textarea = document.createElement('textarea');
  textarea.id = 'communication-message';
  textarea.rows = 5;
  textarea.required = true;
  label.appendChild(textarea);

  const errorEl = document.createElement('p');
  errorEl.id = 'communication-create-error';
  errorEl.className = 'message error';

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Publier';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'link';
  cancelButton.textContent = 'Annuler';
  cancelButton.addEventListener('click', renderCommunicationsList);

  form.appendChild(label);
  form.appendChild(errorEl);
  form.appendChild(submitButton);
  form.appendChild(cancelButton);
  form.addEventListener('submit', handleCommunicationCreate);

  contentEl.innerHTML = '';
  contentEl.appendChild(form);
}

async function handleCommunicationCreate(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('communication-create-error');
  const message = document.getElementById('communication-message').value.trim();
  setMessage(errorEl, '');

  if (!message) {
    setMessage(errorEl, 'Le message ne peut pas être vide.', true);
    return;
  }

  submitButton.disabled = true;
  try {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client
      .from('club_communications')
      .insert({ club_id: currentCommunicationsClubId, message, created_by: user.id });

    if (error) {
      setMessage(errorEl, 'Erreur lors de la publication.', true);
      return;
    }

    await renderCommunicationsList();
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, réessaie plus tard.', true);
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('communications-fab').addEventListener('click', openCommunications);
});
