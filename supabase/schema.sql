-- ============================================================
-- Schema complet UltiClub (profils + clubs). Ce fichier est TOUJOURS l'integralite de ce qui doit
-- exister en base -- a chaque evolution du schema, il est mis a jour ici et redonne en entier.
--
-- Idempotent : peut etre colle et execute tel quel dans le SQL Editor Supabase a tout moment (sur
-- un projet neuf ou un projet deja partiellement a jour), sans se soucier de ce qui a deja ete
-- execute avant -- aucun risque de "relation already exists" ou de policy en double.
-- ============================================================

create extension if not exists pgcrypto;

-- --- Clubs ---------------------------------------------------

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- Insensible a la casse : "Les Aigles" et "les aigles" comptent comme le meme club.
create unique index if not exists clubs_nom_unique_ci on public.clubs (lower(nom));

alter table public.clubs enable row level security;

-- La recherche de club doit pouvoir lister tous les clubs existants, pas seulement le sien.
drop policy if exists "Les utilisateurs authentifies lisent les clubs" on public.clubs;
create policy "Les utilisateurs authentifies lisent les clubs"
  on public.clubs for select
  to authenticated
  using (true);

drop policy if exists "Les utilisateurs authentifies creent un club" on public.clubs;
create policy "Les utilisateurs authentifies creent un club"
  on public.clubs for insert
  to authenticated
  with check (auth.uid() = created_by);

-- --- Profils ---------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  pseudo text not null unique,
  created_at timestamptz not null default now()
);

-- Club de l'utilisateur (un seul a la fois). Niveaux cumulables en plus de "joueur" (le niveau de
-- base, implicite pour tout membre d'un club, rien a stocker pour lui) : encadrant donne acces a
-- l'onglet "Gestion equipe", membre du bureau donne acces a l'onglet "Gestion club". Le createur
-- d'un club recoit les deux automatiquement (voir js/club.js).
alter table public.profiles add column if not exists club_id uuid references public.clubs (id);
alter table public.profiles add column if not exists role_encadrant boolean not null default false;
alter table public.profiles add column if not exists role_membre_bureau boolean not null default false;

-- Ancien systeme (connexion par pseudo + telephone obligatoire), abandonne au profit de la
-- connexion par email : supprime s'il traine encore sur ce projet.
alter table public.profiles drop column if exists telephone;
drop function if exists public.email_for_pseudo(text);

alter table public.profiles enable row level security;

drop policy if exists "Les utilisateurs creent leur propre profil" on public.profiles;
create policy "Les utilisateurs creent leur propre profil"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Les utilisateurs lisent leur propre profil" on public.profiles;
create policy "Les utilisateurs lisent leur propre profil"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Necessaire pour rejoindre/creer un club ou changer de role (mise a jour de son propre profil).
drop policy if exists "Les utilisateurs modifient leur propre profil" on public.profiles;
create policy "Les utilisateurs modifient leur propre profil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
