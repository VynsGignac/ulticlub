-- ============================================================
-- Ajoute les niveaux (roles) d'un joueur au sein de son club : tout le monde est "joueur" par
-- defaut (rien a stocker pour ca), et peut cumuler encadrant (acces a l'onglet "Gestion equipe")
-- et/ou membre du bureau (acces a l'onglet "Gestion club"). A coller une fois dans le SQL Editor
-- du projet Supabase existant.
-- ============================================================

alter table public.profiles
  add column role_encadrant boolean not null default false,
  add column role_membre_bureau boolean not null default false;
