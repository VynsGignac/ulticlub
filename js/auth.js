// ============================================================
// Authentification (connexion / creation de compte) via Supabase Auth + table profiles.
// Le champ "profil" du menu de connexion est le pseudo choisi a l'inscription (pas l'email) :
// on retrouve l'email associe via la fonction RPC email_for_pseudo (voir supabase/schema.sql,
// necessaire car Supabase Auth authentifie par email, pas par pseudo), puis on se connecte
// normalement aupres de Supabase avec cet email + le mot de passe saisi.
// ============================================================

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const { data } = await client.from('profiles').select('pseudo, nom').eq('id', userId).single();
  return data;
}

function enterApp(pseudo) {
  document.getElementById('app-pseudo').textContent = pseudo;
  showView('view-app');
}

async function handleLogin(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const pseudo = document.getElementById('login-pseudo').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  setMessage(errorEl, '');
  submitButton.disabled = true;

  try {
    const { data: email, error: lookupError } = await client.rpc('email_for_pseudo', { pseudo_input: pseudo });
    if (lookupError || !email) {
      setMessage(errorEl, 'Identifiants incorrects.', true);
      return;
    }

    const { error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError) {
      setMessage(errorEl, 'Identifiants incorrects.', true);
      return;
    }

    enterApp(pseudo);
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, reessaie plus tard.', true);
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
  const telephone = document.getElementById('signup-telephone').value.trim();
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

    const { error: profileError } = await client.from('profiles').insert({ id: userId, nom, pseudo, telephone });
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
    document.getElementById('login-pseudo').value = pseudo;
    showView('view-login');
    setMessage(document.getElementById('login-info'), 'Compte cree, tu peux te connecter.');
  } catch {
    setMessage(errorEl, 'Connexion au serveur impossible, reessaie plus tard.', true);
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

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('signup-form').addEventListener('submit', handleSignup);
  document.getElementById('logout-button').addEventListener('click', handleLogout);

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
    const profile = await fetchOwnProfile(session.user.id);
    enterApp(profile ? profile.pseudo : session.user.email);
  }
});
