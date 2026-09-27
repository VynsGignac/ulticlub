-- ============================================================
-- Schema complet UltiClub (profils + clubs) pour un projet Supabase neuf.
-- A executer une fois dans le SQL Editor du projet Supabase (supabase.com > ton projet > SQL
-- Editor > New query > coller ce fichier > Run).
--
-- Si ton projet existe deja et a ete construit au fil des versions precedentes, utilise plutot
-- les fichiers de supabase/migrations/ dans l'ordre pour rattraper ton schema sans repartir de
-- zero.
--
-- Supabase Auth gere nativement email + mot de passe (table auth.users, mots de passe hashes) :
-- la connexion se fait directement avec l'email saisi.
-- ============================================================

create extension if not exists pgcrypto;

-- Informations de profil complementaires (nom, pseudo, club) liees a chaque compte auth. Le
-- pseudo sert uniquement a l'affichage dans l'app, pas a la connexion.
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- Insensible a la casse : "Les Aigles" et "les aigles" comptent comme le meme club.
create unique index clubs_nom_unique_ci on public.clubs (lower(nom));

alter table public.clubs enable row level security;

-- La recherche de club doit pouvoir lister tous les clubs existants, pas seulement le sien.
create policy "Les utilisateurs authentifies lisent les clubs"
  on public.clubs for select
  to authenticated
  using (true);

create policy "Les utilisateurs authentifies creent un club"
  on public.clubs for insert
  to authenticated
  with check (auth.uid() = created_by);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  pseudo text not null unique,
  club_id uuid references public.clubs (id),
  -- Tout le monde est "joueur" par defaut (rien a stocker). Roles additionnels cumulables :
  -- encadrant (onglet "Gestion equipe") et/ou membre du bureau (onglet "Gestion club").
  role_encadrant boolean not null default false,
  role_membre_bureau boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Un utilisateur ne peut creer/lire/modifier que sa propre ligne de profil (modifier = rejoindre
-- ou changer de club).
create policy "Les utilisateurs creent leur propre profil"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Les utilisateurs lisent leur propre profil"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Les utilisateurs modifient leur propre profil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
