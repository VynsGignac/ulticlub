// ============================================================
// Onglet Administratif (reserve au role "membre du bureau") : 3 sous-onglets.
// - "Liste des membres" : roster officiel du club (table club_licencies), saisi et tenu a jour a la
//   main par le bureau. VOLONTAIREMENT SANS LIEN avec les comptes de l'app (profiles/club_members)
//   -- un licencie n'a pas forcement de compte sur l'app, et inversement (voir supabase/schema.sql).
// - "Dette" et "Finance Club" : a venir.
// ============================================================

let administratifClubId = null;

function renderAdministratifTab() {
  selectAdministratifSubTab('liste-membres');
}

function selectAdministratifSubTab(subTabId) {
  document.querySelectorAll('#tab-content-administratif .subtab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.subtab === subTabId);
  });
  document.getElementById('administratif-subtab-liste-membres').style.display = subTabId === 'liste-membres' ? '' : 'none';
  document.getElementById('administratif-subtab-dette').style.display = subTabId === 'dette' ? '' : 'none';
  document.getElementById('administratif-subtab-finance-club').style.display = subTabId === 'finance-club' ? '' : 'none';

  if (subTabId === 'liste-membres') {
    renderListeMembresSubTab();
  } else if (subTabId === 'dette') {
    document.getElementById('administratif-dette-content').innerHTML = '<p class="message">Contenu à venir.</p>';
  } else {
    document.getElementById('administratif-finance-club-content').innerHTML = '<p class="message">Contenu à venir.</p>';
  }
}

// --- Liste des membres (club_licencies) --------------------------------------------------

async function fetchAdministratifClubId() {
  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  return profile ? profile.active_club_id : null;
}

async function renderListeMembresSubTab() {
  const contentEl = document.getElementById('administratif-liste-membres-content');
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  administratifClubId = await fetchAdministratifClubId();
  if (!administratifClubId) {
    contentEl.innerHTML = '<p class="message">Aucun club actif.</p>';
    return;
  }

  const { data: licencies } = await client
    .from('club_licencies')
    .select('id, nom, prenom, date_naissance, categorie, equipe, licence, telephone, mail')
    .eq('club_id', administratifClubId)
    .order('nom', { ascending: true });

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const newButton = document.createElement('button');
  newButton.type = 'button';
  newButton.className = 'action-button';
  newButton.textContent = 'Nouveau membre';
  newButton.addEventListener('click', openLicencieCreate);
  wrapper.appendChild(newButton);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!licencies || !licencies.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre pour l’instant.</li>';
  } else {
    for (const licencie of licencies) {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.className = 'split-view-item-name';
      nameEl.textContent = [licencie.prenom, licencie.nom].filter(Boolean).join(' ') || licencie.nom;
      li.appendChild(nameEl);

      const metaText = [licencie.equipe, licencie.categorie].filter(Boolean).join(' · ');
      if (metaText) {
        const metaEl = document.createElement('span');
        metaEl.className = 'split-view-item-meta';
        metaEl.textContent = metaText;
        li.appendChild(metaEl);
      }

      li.addEventListener('click', () => openLicencieDetail(licencie));
      listEl.appendChild(li);
    }
  }
  wrapper.appendChild(listEl);

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

function openLicencieCreate() {
  const contentEl = showModal('Nouveau membre');
  contentEl.innerHTML = '';
  contentEl.appendChild(buildLicencieForm(null));
}

function openLicencieDetail(licencie) {
  const contentEl = showModal([licencie.prenom, licencie.nom].filter(Boolean).join(' ') || licencie.nom);
  contentEl.innerHTML = '';
  contentEl.appendChild(buildLicencieForm(licencie));
}

function buildLicencieForm(existing) {
  const form = document.createElement('form');
  form.className = 'panel';

  const addField = (id, labelText, type, required, value) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.required = !!required;
    if (value) input.value = value;
    label.appendChild(input);
    form.appendChild(label);
    return input;
  };

  addField('licencie-nom', 'Nom', 'text', true, existing ? existing.nom : '');
  addField('licencie-prenom', 'Prénom', 'text', false, existing ? existing.prenom : '');
  addField('licencie-date-naissance', 'Date de naissance', 'date', false, existing ? existing.date_naissance : '');
  addField('licencie-categorie', 'Catégorie', 'text', false, existing ? existing.categorie : '');
  addField('licencie-equipe', 'Équipe', 'text', false, existing ? existing.equipe : '');
  addField('licencie-licence', 'Licence', 'text', false, existing ? existing.licence : '');
  addField('licencie-telephone', 'Téléphone', 'tel', false, existing ? existing.telephone : '');
  addField('licencie-mail', 'Mail', 'email', false, existing ? existing.mail : '');

  const infoEl = document.createElement('p');
  infoEl.id = 'licencie-form-info';
  infoEl.className = 'message';
  const errorEl = document.createElement('p');
  errorEl.id = 'licencie-form-error';
  errorEl.className = 'message error';
  form.appendChild(infoEl);
  form.appendChild(errorEl);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = existing ? 'Enregistrer' : 'Ajouter le membre';
  form.appendChild(submitButton);

  if (existing) {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'link';
    deleteButton.textContent = 'Supprimer ce membre';
    deleteButton.addEventListener('click', () => handleLicencieDelete(existing.id));
    form.appendChild(deleteButton);

    form.addEventListener('submit', (event) => handleLicencieSave(event, existing));
  } else {
    form.addEventListener('submit', (event) => handleLicencieSave(event, null));
  }

  return form;
}

function readLicencieFormPayload() {
  return {
    nom: document.getElementById('licencie-nom').value.trim(),
    prenom: document.getElementById('licencie-prenom').value.trim() || null,
    date_naissance: document.getElementById('licencie-date-naissance').value || null,
    categorie: document.getElementById('licencie-categorie').value.trim() || null,
    equipe: document.getElementById('licencie-equipe').value.trim() || null,
    licence: document.getElementById('licencie-licence').value.trim() || null,
    telephone: document.getElementById('licencie-telephone').value.trim() || null,
    mail: document.getElementById('licencie-mail').value.trim() || null,
  };
}

async function handleLicencieSave(event, existing) {
  event.preventDefault();
  const submitButton = event.submitter;
  const errorEl = document.getElementById('licencie-form-error');
  const infoEl = document.getElementById('licencie-form-info');
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const payload = readLicencieFormPayload();

  submitButton.disabled = true;
  try {
    if (existing) {
      const { error } = await client.from('club_licencies').update(payload).eq('id', existing.id);
      if (error) {
        setMessage(errorEl, 'Erreur lors de l’enregistrement.', true);
        return;
      }
      Object.assign(existing, payload);
      setMessage(infoEl, 'Modifications enregistrées.');
    } else {
      const user = await requireUser();
      const { error } = await client.from('club_licencies').insert({ ...payload, club_id: administratifClubId, created_by: user.id });
      if (error) {
        setMessage(errorEl, 'Erreur lors de l’ajout.', true);
        return;
      }
      // Reste sur le formulaire (reinitialise) plutot que de fermer la fenetre : on peut enchainer
      // l'ajout de plusieurs membres sans la rouvrir a chaque fois (meme choix que pour un projet).
      event.target.reset();
      setMessage(infoEl, 'Membre ajouté.');
    }
    // La liste vit sous la fenetre modale (pas de bouton "Retour" qui la redeclenche) : on la
    // rafraichit en arriere-plan pour qu'elle soit a jour quand la fenetre se ferme.
    renderListeMembresSubTab();
  } catch (err) {
    console.error('handleLicencieSave: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleLicencieDelete(licencieId) {
  if (!confirm('Supprimer ce membre de la liste ?')) return;

  const { error } = await client.from('club_licencies').delete().eq('id', licencieId);
  if (error) {
    setMessage(document.getElementById('licencie-form-error'), 'Erreur lors de la suppression.', true);
    return;
  }

  closeModal();
  renderListeMembresSubTab();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#tab-content-administratif .subtab-button').forEach((button) => {
    button.addEventListener('click', () => selectAdministratifSubTab(button.dataset.subtab));
  });
});
