-- ============================================================
-- Schema complet UltiClub (profils, clubs, appartenances). Ce fichier est TOUJOURS l'integralite
-- de ce qui doit exister en base -- a chaque evolution du schema, il est mis a jour ici et redonne
-- en entier.
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

-- Informations personnelles editables depuis l'onglet Profil (toutes facultatives : remplies
-- apres coup, pas a l'inscription).
alter table public.profiles add column if not exists prenom text;
alter table public.profiles add column if not exists telephone text;
alter table public.profiles add column if not exists adresse text;
alter table public.profiles add column if not exists date_naissance date;

-- Case a cocher "visible par les membres hors du bureau" pour ces 4 champs (email, telephone,
-- adresse, date de naissance) : cochee par defaut. Ne pilote encore aucune logique d'affichage
-- reelle, seulement la preference de l'utilisateur -- la visibilite en elle-meme viendra plus tard.
alter table public.profiles add column if not exists visible_email boolean not null default true;
alter table public.profiles add column if not exists visible_telephone boolean not null default true;
alter table public.profiles add column if not exists visible_adresse boolean not null default true;
alter table public.profiles add column if not exists visible_date_naissance boolean not null default true;

-- Ancien systeme (connexion par pseudo), abandonne au profit de la connexion par email.
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

drop policy if exists "Les utilisateurs modifient leur propre profil" on public.profiles;
create policy "Les utilisateurs modifient leur propre profil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --- Appartenance aux clubs -----------------------------------
-- Un utilisateur peut appartenir a plusieurs clubs a la fois (onglet Profil : liste de ses clubs,
-- bouton pour en quitter un ou basculer vers un autre). Chaque appartenance porte ses propres
-- niveaux, cumulables en plus de "joueur" (le niveau de base, implicite, rien a stocker pour lui) :
-- encadrant donne acces a l'onglet "Gestion equipe", membre du bureau donne acces a l'onglet
-- "Gestion club". Le createur d'un club recoit les deux automatiquement.

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  role_encadrant boolean not null default false,
  role_membre_bureau boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, club_id)
);

alter table public.club_members enable row level security;

drop policy if exists "Les utilisateurs lisent leurs propres appartenances" on public.club_members;
create policy "Les utilisateurs lisent leurs propres appartenances"
  on public.club_members for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Les utilisateurs rejoignent un club en leur nom" on public.club_members;
create policy "Les utilisateurs rejoignent un club en leur nom"
  on public.club_members for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Les utilisateurs quittent un club en leur nom" on public.club_members;
create policy "Les utilisateurs quittent un club en leur nom"
  on public.club_members for delete
  to authenticated
  using (auth.uid() = user_id);

-- Club "actif" (celui affiche par defaut dans les autres onglets), parmi les appartenances de
-- club_members ci-dessus. Migre automatiquement l'ancien modele mono-club (profiles.club_id +
-- roles directement sur profiles) si ce projet l'utilisait encore -- sans effet si deja fait.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'club_id'
  ) then
    insert into public.club_members (user_id, club_id, role_encadrant, role_membre_bureau)
    select id, club_id, role_encadrant, role_membre_bureau
    from public.profiles
    where club_id is not null
    on conflict (user_id, club_id) do nothing;

    alter table public.profiles rename column club_id to active_club_id;
  end if;
end $$;

alter table public.profiles add column if not exists active_club_id uuid references public.clubs (id);
alter table public.profiles drop column if exists role_encadrant;
alter table public.profiles drop column if exists role_membre_bureau;

-- --- Equipes (onglet Gestion equipe, reserve aux encadrants) ---
-- Une equipe appartient a un seul club. Son nom est unique dans ce club (mais deux clubs peuvent
-- chacun avoir une equipe "Seniors"), insensible a la casse.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  nom text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index if not exists teams_nom_unique_ci on public.teams (club_id, lower(nom));

alter table public.teams enable row level security;

drop policy if exists "Les membres du club lisent les equipes de leur club" on public.teams;
create policy "Les membres du club lisent les equipes de leur club"
  on public.teams for select
  to authenticated
  using (exists (
    select 1 from public.club_members cm
    where cm.club_id = teams.club_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les encadrants creent une equipe dans leur club" on public.teams;
create policy "Les encadrants creent une equipe dans leur club"
  on public.teams for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.club_members cm
      where cm.club_id = teams.club_id and cm.user_id = auth.uid() and cm.role_encadrant = true
    )
  );

-- Responsables d'une equipe (plusieurs possibles). Le createur d'une equipe en devient
-- responsable automatiquement (voir js/team-management.js).

create table if not exists public.team_managers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table public.team_managers enable row level security;

drop policy if exists "Les membres du club lisent les responsables d'equipe" on public.team_managers;
create policy "Les membres du club lisent les responsables d'equipe"
  on public.team_managers for select
  to authenticated
  using (exists (
    select 1 from public.teams t
    join public.club_members cm on cm.club_id = t.club_id
    where t.id = team_managers.team_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Un encadrant s'ajoute comme responsable d'equipe" on public.team_managers;
create policy "Un encadrant s'ajoute comme responsable d'equipe"
  on public.team_managers for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.teams t
      join public.club_members cm on cm.club_id = t.club_id
      where t.id = team_managers.team_id and cm.user_id = auth.uid() and cm.role_encadrant = true
    )
  );
