-- ============================================================
-- Schema du compte utilisateur UltiClub (profil + connexion par email).
-- A executer une fois dans le SQL Editor du projet Supabase (supabase.com > ton projet > SQL
-- Editor > New query > coller ce fichier > Run) pour un projet neuf.
--
-- Si tu as deja execute une version precedente de ce fichier (avec le telephone et la connexion
-- par pseudo), utilise plutot supabase/migrations/0001_login_par_email.sql pour mettre a jour
-- ton projet existant sans repartir de zero.
--
-- Supabase Auth gere nativement email + mot de passe (table auth.users, mots de passe hashes) :
-- la connexion se fait directement avec l'email saisi, pas besoin de correspondance pseudo -> email.
-- ============================================================

-- Informations de profil complementaires (nom, pseudo) liees a chaque compte auth. Le pseudo sert
-- uniquement a l'affichage dans l'app (ex. "Connecte en tant que ..."), pas a la connexion.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  pseudo text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Un utilisateur ne peut creer/lire que sa propre ligne de profil.
create policy "Les utilisateurs creent leur propre profil"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Les utilisateurs lisent leur propre profil"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);
