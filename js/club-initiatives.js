// ============================================================
// Mecanisme de "commission" partage par 5 onglets : Sport, Kid, Vie Associative, Communication et
// Disciplinaire (ces 2 derniers ajoutes le 2026-10-26). Tous les 5 ont une colonne "membres de la
// commission" (table club_commission_members, choisis dans le roster club_licencies de l'onglet
// Administratif -- PAS dans les comptes de l'app) ; ajouter/retirer un membre est reserve au bureau
// (ca necessite de lire club_licencies, reservee au bureau -- voir supabase/schema.sql). Nommer le
// RESPONSABLE d'une commission ne se fait plus ici (retire le 2026-10-26) : c'est desormais reserve
// au president, depuis Bureau > Responsables de commission (voir js/bureau.js) -- exactement comme
// pour les roles legaux president/secretaire/tresorier.
//
// Seuls Sport, Kid et Vie Associative ont EN PLUS une mise en page a 3 colonnes (voir
// renderClubInitiativesTab) : membres a gauche, projets (table club_initiatives, colonne domaine,
// tries par echeance la plus proche) au centre, formulaire de creation integre a droite. Chaque
// projet porte aussi "Demande bureau" (champ libre, editable ici) et "Décision bureau" (reponse du
// bureau, affichee ici en lecture seule -- editable uniquement depuis Bureau > Réunion bureau, voir
// js/bureau.js), et apparait dans l'onglet Calendrier a la date de son echeance (voir
// js/calendar.js), filtrable par commission. Communication et Disciplinaire n'ont PAS cette partie
// "projets" (voir renderCommissionMembersOnlyTab) -- juste la colonne membres, seule.
// ============================================================

const CLUB_INITIATIVE_STATUTS = ['Non démarré', 'Amorcé', 'En cours', 'Terminé'];
const CLUB_INITIATIVE_PERIODICITES = ['Ponctuel', 'Hebdomadaire', 'Mensuel', 'Trimestriel', 'Annuel'];
// Libelles des 5 commissions, reutilises par js/calendar.js (points par commission -- seules
// sport/kid/vie_associative y apparaissent, les 2 autres n'ont pas de projets) et js/bureau.js
// (sous-onglets Réunion bureau et Responsables de commission).
const CLUB_INITIATIVE_DOMAINE_LABELS = {
  sport: 'Sport',
  kid: 'Kid',
  vie_associative: 'Vie Associative',
  communication: 'Communication',
  disciplinaire: 'Disciplinaire',
};
// Ordre d'affichage des 5 commissions dans Bureau > Responsables de commission (voir js/bureau.js).
const CLUB_COMMISSION_DOMAINE_ORDER = ['sport', 'kid', 'vie_associative', 'communication', 'disciplinaire'];

// Domaine/club/role actifs : mis a jour juste avant chaque rendu complet de l'onglet, lus par les
// actions declenchees depuis les fenetres modales (edition de projet, gestion des membres).
let currentInitiativeDomaine = null;
let currentInitiativeClubId = null;
let currentInitiativeIsBureau = false;
// Statut de lien compte/licencie (voir club_licencies_link_status() dans supabase/schema.sql),
// recharge a chaque rendu complet de l'onglet -- utilise pour le badge "Compte lié"/"Compte bureau
// lié" dans la colonne des membres de la commission.
let currentInitiativeLinkStatusByLicencieId = new Map();

function renderSportTab() { renderClubInitiativesTab('sport', 'sport-content'); }
function renderKidTab() { renderClubInitiativesTab('kid', 'kid-content'); }
function renderVieAssociativeTab() { renderClubInitiativesTab('vie_associative', 'vie-associative-content'); }
function renderCommunicationTab() { renderCommissionMembersOnlyTab('communication', 'communication-content'); }
function renderDisciplinaireTab() { renderCommissionMembersOnlyTab('disciplinaire', 'disciplinaire-content'); }

async function renderClubInitiativesTab(domaine, contentElId) {
  currentInitiativeDomaine = domaine;
  const contentEl = document.getElementById(contentElId);
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  currentInitiativeClubId = profile ? profile.active_club_id : null;

  if (!currentInitiativeClubId) {
    contentEl.innerHTML = '<p class="message">Aucun club actif.</p>';
    return;
  }

  const [{ data: initiatives }, { data: members }, { data: membership }, { data: linkStatuses }] = await Promise.all([
    client
      .from('club_initiatives')
      .select('id, nom, porteur, echeance, description, statut, periodicite, demande_bureau, decision_bureau')
      .eq('club_id', currentInitiativeClubId)
      .eq('domaine', domaine)
      .order('echeance', { ascending: true }),
    client
      .from('club_commission_members')
      .select('id, licencie_id, nom, prenom, responsable')
      .eq('club_id', currentInitiativeClubId)
      .eq('domaine', domaine)
      .order('nom', { ascending: true }),
    client.from('club_members').select('role_membre_bureau').eq('user_id', user.id).eq('club_id', currentInitiativeClubId).maybeSingle(),
    client.rpc('club_licencies_link_status', { target_club_id: currentInitiativeClubId }),
  ]);
  currentInitiativeIsBureau = !!(membership && membership.role_membre_bureau);
  currentInitiativeLinkStatusByLicencieId = new Map((linkStatuses || []).map((s) => [s.licencie_id, s]));

  const layout = document.createElement('div');
  layout.className = 'commission-layout';
  layout.appendChild(buildCommissionMembersColumn(members || [], contentElId));
  layout.appendChild(buildCommissionProjectsColumn(initiatives || [], contentElId));
  layout.appendChild(buildCommissionCreateColumn(contentElId));

  contentEl.innerHTML = '';
  contentEl.appendChild(layout);
}

// Variante de renderClubInitiativesTab pour Communication et Disciplinaire (2026-10-26) : meme
// colonne "membres de la commission", mais SEULE (pas de projets/club_initiatives pour ces 2
// domaines) -- rendue en pleine largeur comme une liste classique (Administratif, Bureau...),
// plutot que dans la grille 3 colonnes reservee a Sport/Kid/Vie Associative.
async function renderCommissionMembersOnlyTab(domaine, contentElId) {
  currentInitiativeDomaine = domaine;
  const contentEl = document.getElementById(contentElId);
  contentEl.innerHTML = '<p class="message">Chargement...</p>';

  const user = await requireUser();
  const { data: profile } = await client.from('profiles').select('active_club_id').eq('id', user.id).single();
  currentInitiativeClubId = profile ? profile.active_club_id : null;

  if (!currentInitiativeClubId) {
    contentEl.innerHTML = '<p class="message">Aucun club actif.</p>';
    return;
  }

  const [{ data: members }, { data: membership }, { data: linkStatuses }] = await Promise.all([
    client
      .from('club_commission_members')
      .select('id, licencie_id, nom, prenom, responsable')
      .eq('club_id', currentInitiativeClubId)
      .eq('domaine', domaine)
      .order('nom', { ascending: true }),
    client.from('club_members').select('role_membre_bureau').eq('user_id', user.id).eq('club_id', currentInitiativeClubId).maybeSingle(),
    client.rpc('club_licencies_link_status', { target_club_id: currentInitiativeClubId }),
  ]);
  currentInitiativeIsBureau = !!(membership && membership.role_membre_bureau);
  currentInitiativeLinkStatusByLicencieId = new Map((linkStatuses || []).map((s) => [s.licencie_id, s]));

  const wrapper = document.createElement('div');
  wrapper.className = 'panel panel-wide';
  wrapper.appendChild(buildCommissionMembersContent(members || [], contentElId));

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
}

// --- Colonne de gauche : membres de la commission --------------------------------------------

// Liste + bouton "Ajouter un membre" seuls (sans le titre ni la carte .commission-column), pour
// pouvoir etre reutilises tels quels par renderCommissionMembersOnlyTab ci-dessus (Communication/
// Disciplinaire) comme par buildCommissionMembersColumn ci-dessous (Sport/Kid/Vie Associative).
function buildCommissionMembersContent(members, contentElId) {
  const fragment = document.createDocumentFragment();

  const listEl = document.createElement('ul');
  listEl.className = 'club-results commission-members-list';
  renderCommissionMembersListInto(listEl, members, contentElId);
  fragment.appendChild(listEl);

  if (currentInitiativeIsBureau) {
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'action-button';
    addButton.textContent = 'Ajouter un membre';
    addButton.addEventListener('click', () => openCommissionMemberPicker(contentElId));
    fragment.appendChild(addButton);
  }

  return fragment;
}

function buildCommissionMembersColumn(members, contentElId) {
  const column = document.createElement('div');
  column.className = 'commission-column';

  const title = document.createElement('h3');
  title.textContent = 'Membres de la commission';
  column.appendChild(title);
  column.appendChild(buildCommissionMembersContent(members, contentElId));

  return column;
}

function renderCommissionMembersListInto(listEl, members, contentElId) {
  listEl.innerHTML = '';
  if (!members.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre pour l’instant.</li>';
    return;
  }

  // Les responsables d'abord (mis en evidence), ordre alphabetique conserve dans chaque groupe.
  const sorted = [...members].sort((a, b) => (b.responsable ? 1 : 0) - (a.responsable ? 1 : 0));

  for (const member of sorted) {
    const li = document.createElement('li');
    li.classList.toggle('highlight', member.responsable);

    const nameEl = document.createElement('span');
    nameEl.className = 'split-view-item-name';
    nameEl.textContent = [member.prenom, member.nom].filter(Boolean).join(' ') || member.nom;
    li.appendChild(nameEl);

    if (member.responsable) {
      const tagEl = document.createElement('span');
      tagEl.className = 'split-view-item-meta';
      tagEl.textContent = 'Responsable de commission';
      li.appendChild(tagEl);
    }

    const linkStatus = currentInitiativeLinkStatusByLicencieId.get(member.licencie_id);
    if (linkStatus && (linkStatus.compte_lie || linkStatus.compte_bureau)) {
      const linkTagEl = document.createElement('span');
      linkTagEl.className = 'split-view-item-meta';
      linkTagEl.textContent = linkStatus.compte_bureau ? 'Compte bureau lié' : 'Compte lié';
      li.appendChild(linkTagEl);
    }

    if (currentInitiativeIsBureau) {
      li.addEventListener('click', () => openCommissionMemberActions(member, contentElId));
    } else {
      li.style.cursor = 'default';
    }

    listEl.appendChild(li);
  }
}

async function refreshCommissionMembersColumn(contentElId) {
  const contentEl = document.getElementById(contentElId);
  const listEl = contentEl.querySelector('.commission-members-list');
  if (!listEl) return;

  const { data: members } = await client
    .from('club_commission_members')
    .select('id, licencie_id, nom, prenom, responsable')
    .eq('club_id', currentInitiativeClubId)
    .eq('domaine', currentInitiativeDomaine)
    .order('nom', { ascending: true });

  renderCommissionMembersListInto(listEl, members || [], contentElId);
}

// Nommer/retirer le responsable de la commission ne se fait plus ici (voir le commentaire en tete
// de fichier) : seule l'action "Retirer de la commission" reste disponible depuis cet onglet.
function openCommissionMemberActions(member, contentElId) {
  const body = showModal([member.prenom, member.nom].filter(Boolean).join(' ') || member.nom);
  body.innerHTML = '';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'link';
  removeButton.textContent = 'Retirer de la commission';
  removeButton.addEventListener('click', async () => {
    await client.from('club_commission_members').delete().eq('id', member.id);
    closeModal();
    refreshCommissionMembersColumn(contentElId);
  });
  body.appendChild(removeButton);
}

async function openCommissionMemberPicker(contentElId) {
  const body = showModal('Ajouter un membre');
  body.innerHTML = '<p class="message">Chargement...</p>';

  const [{ data: licencies }, { data: existingMembers }] = await Promise.all([
    client.from('club_licencies').select('id, nom, prenom').eq('club_id', currentInitiativeClubId).order('nom', { ascending: true }),
    client.from('club_commission_members').select('licencie_id').eq('club_id', currentInitiativeClubId).eq('domaine', currentInitiativeDomaine),
  ]);

  const existingIds = new Set((existingMembers || []).map((m) => m.licencie_id));
  const available = (licencies || []).filter((l) => !existingIds.has(l.id));

  const listEl = document.createElement('ul');
  listEl.className = 'club-results';
  if (!available.length) {
    listEl.innerHTML = '<li class="empty">Aucun membre disponible (voir Administratif &gt; Liste des membres).</li>';
  } else {
    for (const licencie of available) {
      const li = document.createElement('li');
      li.textContent = [licencie.prenom, licencie.nom].filter(Boolean).join(' ') || licencie.nom;
      li.addEventListener('click', async () => {
        const user = await requireUser();
        await client.from('club_commission_members').insert({
          club_id: currentInitiativeClubId,
          domaine: currentInitiativeDomaine,
          licencie_id: licencie.id,
          nom: licencie.nom,
          prenom: licencie.prenom,
          created_by: user.id,
        });
        closeModal();
        refreshCommissionMembersColumn(contentElId);
      });
      listEl.appendChild(li);
    }
  }

  body.innerHTML = '';
  body.appendChild(listEl);
}

// --- Colonne centrale : projets -----------------------------------------------------------------

function buildCommissionProjectsColumn(initiatives, contentElId) {
  const column = document.createElement('div');
  column.className = 'commission-column commission-column-wide';

  const title = document.createElement('h3');
  title.textContent = 'Projets';
  column.appendChild(title);

  const listEl = document.createElement('ul');
  listEl.className = 'club-results commission-projects-list';
  renderInitiativesListInto(listEl, initiatives, contentElId);
  column.appendChild(listEl);

  return column;
}

function renderInitiativesListInto(listEl, initiatives, contentElId) {
  listEl.innerHTML = '';
  if (!initiatives.length) {
    listEl.innerHTML = '<li class="empty">Aucun projet pour l’instant.</li>';
    return;
  }

  for (const initiative of initiatives) {
    const li = document.createElement('li');

    const nameEl = document.createElement('strong');
    nameEl.textContent = initiative.nom;
    li.appendChild(nameEl);

    const echeanceLabel = new Date(`${initiative.echeance}T00:00:00`).toLocaleDateString('fr-FR');
    const metaEl = document.createElement('div');
    metaEl.className = 'communication-meta';
    metaEl.textContent = [
      initiative.porteur ? `Porteur : ${initiative.porteur}` : null,
      `Échéance : ${echeanceLabel}`,
      `Statut : ${initiative.statut}`,
      `Périodicité : ${initiative.periodicite}`,
    ].filter(Boolean).join(' · ');
    li.appendChild(metaEl);

    if (initiative.description) {
      const descEl = document.createElement('div');
      descEl.className = 'communication-body';
      descEl.textContent = initiative.description;
      li.appendChild(descEl);
    }

    li.addEventListener('click', () => openInitiativeDetail(initiative, contentElId));
    listEl.appendChild(li);
  }
}

async function refreshCommissionProjectsColumn(contentElId) {
  const contentEl = document.getElementById(contentElId);
  const listEl = contentEl.querySelector('.commission-projects-list');
  if (!listEl) return;

  const { data: initiatives } = await client
    .from('club_initiatives')
    .select('id, nom, porteur, echeance, description, statut, periodicite, demande_bureau, decision_bureau')
    .eq('club_id', currentInitiativeClubId)
    .eq('domaine', currentInitiativeDomaine)
    .order('echeance', { ascending: true });

  renderInitiativesListInto(listEl, initiatives || [], contentElId);
}

function openInitiativeDetail(initiative, contentElId) {
  const modalContentEl = showModal(initiative.nom);
  modalContentEl.innerHTML = '';
  modalContentEl.appendChild(buildInitiativeForm(initiative, contentElId));
}

// --- Colonne de droite : creation de projet (formulaire integre, pas de fenetre modale) ---------

function buildCommissionCreateColumn(contentElId) {
  const column = document.createElement('div');
  column.className = 'commission-column';

  const title = document.createElement('h3');
  title.textContent = 'Créer un projet';
  column.appendChild(title);

  const form = buildInitiativeForm(null, contentElId);
  // Le formulaire reutilise buildInitiativeForm (partage avec la fenetre modale d'edition), qui le
  // cape a var(--form-max-width) par defaut -- ici il doit au contraire remplir sa colonne.
  form.classList.add('commission-inline-form');
  column.appendChild(form);

  return column;
}

// N'utilise PAS d'id sur les champs (contrairement aux autres formulaires de l'app) : ce formulaire
// est desormais rendu a la fois en permanence dans la colonne de creation ET, simultanement, dans
// la fenetre modale d'edition d'un projet existant -- 2 instances a la fois dans le DOM. Des id
// fixes (ex. "initiative-nom") s'y seraient dupliques, et document.getElementById() aurait toujours
// renvoye la PREMIERE instance (celle de la colonne), pas forcement celle qu'on vient de soumettre
// -- bug reel observe en testant : le formulaire d'edition se retrouvait a lire/ecrire les champs du
// formulaire de creation. A la place, chaque instance garde ses propres references d'elements en
// fermeture (fields/infoEl/errorEl), passees directement au gestionnaire de soumission.
function buildInitiativeForm(existing, contentElId) {
  const form = document.createElement('form');
  form.className = 'panel';
  const fields = {};

  const addField = (key, labelText, type, required, value) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.required = !!required;
    if (value) input.value = value;
    label.appendChild(input);
    form.appendChild(label);
    fields[key] = input;
    return input;
  };

  addField('nom', 'Nom', 'text', true, existing ? existing.nom : '');
  addField('porteur', 'Porteur', 'text', false, existing ? existing.porteur : '');
  addField('echeance', 'Échéance', 'date', true, existing ? existing.echeance : '');

  const descLabel = document.createElement('label');
  descLabel.textContent = 'Description';
  const descArea = document.createElement('textarea');
  descArea.rows = 4;
  descArea.value = existing ? (existing.description || '') : '';
  descLabel.appendChild(descArea);
  form.appendChild(descLabel);
  fields.description = descArea;

  const buildSelect = (key, labelText, options, value) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const select = document.createElement('select');
    for (const option of options) {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      opt.selected = value ? option === value : option === options[0];
      select.appendChild(opt);
    }
    label.appendChild(select);
    form.appendChild(label);
    fields[key] = select;
    return select;
  };

  buildSelect('statut', 'Statut', CLUB_INITIATIVE_STATUTS, existing ? existing.statut : null);
  buildSelect('periodicite', 'Périodicité', CLUB_INITIATIVE_PERIODICITES, existing ? existing.periodicite : null);

  // "Demande bureau" : champ libre, editable ici par n'importe quel membre comme le reste du
  // projet -- une demande a transmettre au bureau. "Décision bureau" est la reponse du bureau a
  // cette demande : affichee ici en LECTURE SEULE (elle n'existe donc pas encore a la creation,
  // existing est alors null) -- seul le sous-onglet Bureau > Réunion bureau (voir js/bureau.js)
  // peut la modifier, cote interface uniquement (meme principe que bureau_uniquement ailleurs dans
  // ce projet).
  const demandeLabel = document.createElement('label');
  demandeLabel.textContent = 'Demande bureau';
  const demandeArea = document.createElement('textarea');
  demandeArea.rows = 3;
  demandeArea.value = existing ? (existing.demande_bureau || '') : '';
  demandeLabel.appendChild(demandeArea);
  form.appendChild(demandeLabel);
  fields.demandeBureau = demandeArea;

  if (existing) {
    const decisionLabel = document.createElement('label');
    decisionLabel.textContent = 'Décision bureau';
    const decisionArea = document.createElement('textarea');
    decisionArea.rows = 3;
    decisionArea.readOnly = true;
    decisionArea.placeholder = 'Aucune décision pour le moment.';
    decisionArea.value = existing.decision_bureau || '';
    decisionLabel.appendChild(decisionArea);
    form.appendChild(decisionLabel);
  }

  const infoEl = document.createElement('p');
  infoEl.className = 'message';
  const errorEl = document.createElement('p');
  errorEl.className = 'message error';
  form.appendChild(infoEl);
  form.appendChild(errorEl);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = existing ? 'Enregistrer' : 'Créer';
  form.appendChild(submitButton);

  form.addEventListener('submit', (event) => handleInitiativeSave(event, existing, contentElId, fields, infoEl, errorEl));

  return form;
}

function readInitiativeFormPayload(fields) {
  return {
    nom: fields.nom.value.trim(),
    porteur: fields.porteur.value.trim() || null,
    echeance: fields.echeance.value,
    description: fields.description.value.trim() || null,
    statut: fields.statut.value,
    periodicite: fields.periodicite.value,
    demande_bureau: fields.demandeBureau.value.trim() || null,
  };
}

async function handleInitiativeSave(event, existing, contentElId, fields, infoEl, errorEl) {
  event.preventDefault();
  const submitButton = event.submitter;
  setMessage(errorEl, '');
  setMessage(infoEl, '');

  const payload = readInitiativeFormPayload(fields);

  submitButton.disabled = true;
  try {
    if (existing) {
      const { error } = await client.from('club_initiatives').update(payload).eq('id', existing.id);
      if (error) {
        setMessage(errorEl, 'Erreur lors de l’enregistrement.', true);
        return;
      }
      Object.assign(existing, payload);
      setMessage(infoEl, 'Modifications enregistrées.');
    } else {
      const user = await requireUser();
      const { error } = await client.from('club_initiatives').insert({
        ...payload,
        club_id: currentInitiativeClubId,
        domaine: currentInitiativeDomaine,
        created_by: user.id,
      });
      if (error) {
        setMessage(errorEl, 'Erreur lors de la création.', true);
        return;
      }
      // Reste sur le formulaire (reinitialise) plutot que de le fermer : on peut enchainer la
      // creation de plusieurs projets sans rouvrir quoi que ce soit (le formulaire est maintenant
      // integre a la colonne de droite, pas dans une fenetre modale separee).
      event.target.reset();
      setMessage(infoEl, 'Projet créé.');
    }
    // Rafraichit uniquement la colonne des projets (pas tout l'onglet, sinon le message ci-dessus
    // et le formulaire tout juste reinitialise seraient immediatement ecrases -- creation et liste
    // partagent maintenant le meme conteneur, contrairement a l'ancienne fenetre modale).
    refreshCommissionProjectsColumn(contentElId);
  } catch (err) {
    console.error('handleInitiativeSave: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, réessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}
