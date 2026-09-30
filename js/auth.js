// ============================================================
// Authentification (connexion / creation de compte) via Supabase Auth + table profiles.
// Connexion par email + mot de passe directement aupres de Supabase (le pseudo saisi a
// l'inscription ne sert qu'a l'affichage, pas a la connexion).
// ============================================================

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Utilise partout dans l'app a la place de client.auth.getUser() directement : ce dernier peut
// renvoyer { user: null } SANS lever d'erreur (session expiree, requete qui echoue silencieusement
// dans certains environnements comme la WebView Android...). Sans ce garde-fou, le code suivant
// plantait avec un cryptique "Cannot read properties of null (reading 'id')" au lieu de remonter
// la vraie cause -- ce qui nous a fait perdre du temps a diagnostiquer un bug sur l'APK.
async function requireUser() {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    // Cas reel rencontre : une session enregistree sur l'appareil pointe vers un compte supprime
    // depuis (AuthApiError "User from sub claim in JWT does not exist") -- ca laissait l'utilisateur
    // bloque sur son ecran actuel avec une erreur technique, sans aucun moyen de s'en sortir.
    // On nettoie la session et on renvoie directement vers la connexion, avec un message clair.
    console.error('requireUser: session invalide', error);
    await client.auth.signOut();
    document.getElementById('login-form').reset();
    setMessage(document.getElementById('login-info'), 'Ta session a expiré, reconnecte-toi.');
    showView('view-login');
    throw new Error('Session expirée.');
  }
  return user;
}

function showView(id) {
  for (const view of document.querySelectorAll('.view')) {
    view.classList.toggle('active', view.id === id);
  }
}

function setMessage(el, message, isError) {
  el.textContent = message || '';
  el.classList.toggle('error', !!isError);
}

async function fetchOwnProfile(userId) {
  const { data } = await client
    .from('profiles')
    .select('pseudo, nom, prenom, telephone, adresse, date_naissance, active_club_id')
    .eq('id', userId)
    .single();
  return data;
}

function enterApp(pseudo, clubNom, roles) {
  document.getElementById('app-pseudo').textContent = pseudo;
  document.getElementById('app-club').textContent = clubNom || '';
  renderTabs(roles || { encadrant: false, membreBureau: false });
  showView('view-app');
  refreshCommunicationsBadge();
}

async function handleLogin(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  setMessage(errorEl, '');
  submitButton.disabled = true;

  try {
    const { data, error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError) {
      setMessage(errorEl, 'Identifiants incorrects.', true);
      return;
    }

    // Resynchronise l'email en base (voir supabase/schema.sql) : couvre les comptes crees avant
    // l'ajout de cette colonne, sans que l'utilisateur ait a resauvegarder son profil.
    client.from('profiles').update({ email }).eq('id', data.user.id);

    await routeAfterLogin(data.user.id, email);
  } catch (err) {
    console.error('handleLogin: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, reessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const nom = document.getElementById('signup-nom').value.trim();
  const pseudo = document.getElementById('signup-pseudo').value.trim();
  const password = document.getElementById('signup-password').value;
  const email = document.getElementById('signup-email').value.trim();
  const errorEl = document.getElementById('signup-error');
  setMessage(errorEl, '');
  submitButton.disabled = true;

  try {
    const { data, error: signUpError } = await client.auth.signUp({ email, password });
    if (signUpError) {
      const message = signUpError.message.toLowerCase().includes('registered')
        ? 'Cette adresse mail est deja utilisee.'
        : 'Erreur lors de la creation du compte.';
      setMessage(errorEl, message, true);
      return;
    }

    const userId = data.user && data.user.id;
    if (!userId) {
      setMessage(errorEl, 'Compte cree, verifie ta boite mail avant de te connecter.', true);
      return;
    }

    const { error: profileError } = await client.from('profiles').insert({ id: userId, nom, pseudo, email });
    if (profileError) {
      const message = profileError.code === '23505'
        ? 'Ce pseudo est deja utilise.'
        : 'Erreur lors de la creation du profil.';
      setMessage(errorEl, message, true);
      return;
    }

    await client.auth.signOut();
    document.getElementById('signup-form').reset();
    document.getElementById('login-form').reset();
    document.getElementById('login-email').value = email;
    showView('view-login');
    setMessage(document.getElementById('login-info'), 'Compte cree, tu peux te connecter.');
  } catch (err) {
    console.error('handleSignup: exception', err);
    setMessage(errorEl, `Connexion au serveur impossible, reessaie plus tard. (${err.name}: ${err.message})`, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function handleLogout() {
  await client.auth.signOut();
  document.getElementById('login-form').reset();
  setMessage(document.getElementById('login-info'), '');
  showView('view-login');
}

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.dataset.target);
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  button.textContent = showing ? '👁' : '🙈';
  button.setAttribute('aria-label', showing ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('signup-form').addEventListener('submit', handleSignup);
  document.getElementById('logout-button').addEventListener('click', handleLogout);

  document.querySelectorAll('.toggle-password').forEach((button) => {
    button.addEventListener('click', () => togglePasswordVisibility(button));
  });

  document.getElementById('show-signup').addEventListener('click', () => {
    setMessage(document.getElementById('signup-error'), '');
    showView('view-signup');
  });
  document.getElementById('show-login').addEventListener('click', () => {
    setMessage(document.getElementById('login-info'), '');
    showView('view-login');
  });

  // Reste connecte d'un lancement de l'app a l'autre tant que la session Supabase est valide.
  const { data: { session } } = await client.auth.getSession();
  if (session) {
    client.from('profiles').update({ email: session.user.email }).eq('id', session.user.id);
    await routeAfterLogin(session.user.id, session.user.email);
  }
});
