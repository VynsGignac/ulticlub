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

-- La policy de lecture est plus bas (apres club_members : elle a besoin de cette table pour
-- determiner qui partage un club avec qui).

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

-- Un membre de club doit pouvoir voir le pseudo (et le reste du profil) de ses coequipiers pour
-- les listes de membres/responsables d'equipe -- pas seulement le sien. Les cases "visible par
-- les membres hors du bureau" (voir plus haut) ne sont pas encore appliquees ici : cette policy
-- ouvre juste la lecture entre membres d'un meme club, la restriction fine viendra plus tard.
drop policy if exists "Les utilisateurs lisent leur propre profil" on public.profiles;
drop policy if exists "Les membres d'un meme club lisent les profils de ce club" on public.profiles;
create policy "Les membres d'un meme club lisent les profils de ce club"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from public.club_members cm_self
      join public.club_members cm_other on cm_other.club_id = cm_self.club_id
      where cm_self.user_id = auth.uid() and cm_other.user_id = profiles.id
    )
  );

-- --- Equipes (onglet Gestion equipe, reserve aux encadrants) ---
-- Une equipe appartient a un seul club et se definit par 4 champs obligatoires (categorie,
-- section, division, surface) ; son nom est derive automatiquement de ces champs ("Section
-- Categorie Division Surface", ex. "Adulte Open D1 Outdoor") et unique dans son club, insensible
-- a la casse (mais deux clubs peuvent chacun avoir une equipe portant le meme nom).

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  categorie text not null,
  section text not null,
  division text not null,
  surface text not null,
  nom text generated always as (section || ' ' || categorie || ' ' || division || ' ' || surface) stored,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- Migration pour un projet ayant deja la table teams sous son ancienne forme (nom en texte
-- libre) : ajoute les 4 champs structures, les remplit avec des valeurs de repli pour les lignes
-- existantes (aucune ne devrait exister a ce stade), puis derive nom automatiquement a partir
-- d'eux -- sans effet si deja fait.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'teams' and column_name = 'categorie'
  ) then
    alter table public.teams add column categorie text;
    alter table public.teams add column section text;
    alter table public.teams add column division text;
    alter table public.teams add column surface text;

    update public.teams set
      categorie = coalesce(categorie, 'Open'),
      section = coalesce(section, 'Adulte'),
      division = coalesce(division, coalesce(nom, '?')),
      surface = coalesce(surface, 'Outdoor');

    alter table public.teams alter column categorie set not null;
    alter table public.teams alter column section set not null;
    alter table public.teams alter column division set not null;
    alter table public.teams alter column surface set not null;

    drop index if exists teams_nom_unique_ci;
    alter table public.teams drop column nom;
    alter table public.teams add column nom text generated always as (
      section || ' ' || categorie || ' ' || division || ' ' || surface
    ) stored;
  end if;
end $$;

alter table public.teams drop constraint if exists teams_categorie_check;
alter table public.teams add constraint teams_categorie_check check (categorie in ('Open', 'Féminin', 'Mixte'));

alter table public.teams drop constraint if exists teams_section_check;
alter table public.teams add constraint teams_section_check check (section in ('Junior', 'Adulte', 'Master'));

alter table public.teams drop constraint if exists teams_surface_check;
alter table public.teams add constraint teams_surface_check check (surface in ('Outdoor', 'Indoor', 'Beach'));

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

-- Un encadrant peut designer n'importe quel membre du club comme responsable (pas seulement
-- lui-meme) : necessaire pour l'onglet "Gerer les responsables" (voir js/team-detail.js), qui
-- choisit parmi les membres actuels de l'equipe. Couvre aussi l'auto-affectation a la creation.
drop policy if exists "Un encadrant s'ajoute comme responsable d'equipe" on public.team_managers;
drop policy if exists "Les encadrants gerent les responsables d'equipe (ajout)" on public.team_managers;
create policy "Les encadrants gerent les responsables d'equipe (ajout)"
  on public.team_managers for insert
  to authenticated
  with check (exists (
    select 1 from public.teams t
    join public.club_members cm on cm.club_id = t.club_id
    where t.id = team_managers.team_id and cm.user_id = auth.uid() and cm.role_encadrant = true
  ));

drop policy if exists "Les encadrants gerent les responsables d'equipe (retrait)" on public.team_managers;
create policy "Les encadrants gerent les responsables d'equipe (retrait)"
  on public.team_managers for delete
  to authenticated
  using (exists (
    select 1 from public.teams t
    join public.club_members cm on cm.club_id = t.club_id
    where t.id = team_managers.team_id and cm.user_id = auth.uid() and cm.role_encadrant = true
  ));

-- --- Membres d'une equipe (roster) -----------------------------
-- Distinct des responsables ci-dessus : qui fait partie de l'equipe. Le createur d'une equipe y
-- est ajoute automatiquement (voir js/team-management.js), les autres via "Ajouter des membres".

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table public.team_members enable row level security;

drop policy if exists "Les membres du club lisent les membres d'equipe" on public.team_members;
create policy "Les membres du club lisent les membres d'equipe"
  on public.team_members for select
  to authenticated
  using (exists (
    select 1 from public.teams t
    join public.club_members cm on cm.club_id = t.club_id
    where t.id = team_members.team_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les encadrants ajoutent des membres a l'equipe" on public.team_members;
create policy "Les encadrants ajoutent des membres a l'equipe"
  on public.team_members for insert
  to authenticated
  with check (exists (
    select 1 from public.teams t
    join public.club_members cm on cm.club_id = t.club_id
    where t.id = team_members.team_id and cm.user_id = auth.uid() and cm.role_encadrant = true
  ));
