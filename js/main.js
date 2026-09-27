// ============================================================
// Placeholder -- premiere version servant uniquement a verifier la chaine de developpement
// (build APK, publication web, envoi Discord). Le contenu reel de l'app (gestion de club,
// donnees partagees sur un serveur) viendra ensuite.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = `v${AppVersion}`;
});
