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

-- Dupliquee depuis auth.users (accessible uniquement pour son propre compte via le SDK) afin que
-- les AUTRES membres du club puissent la voir dans la fiche profil, sous reserve de
-- visible_email -- voir js/member-profile.js. Renseignee a l'inscription et resynchronisee a
-- chaque connexion (voir js/auth.js) pour couvrir les comptes crees avant cette colonne.
alter table public.profiles add column if not exists email text;

-- Sur les installations anterieures a la suppression du telephone obligatoire a l'inscription,
-- cette colonne a ete creee "not null" : on l'assouplit pour que les nouvelles inscriptions
-- (qui ne renseignent plus le telephone) ne cassent plus l'insertion du profil.
alter table public.profiles alter column telephone drop not null;

-- Case a cocher "visible par les membres hors du bureau" pour ces 4 champs (email, telephone,
-- adresse, date de naissance) : cochee par defaut. Ne pilote encore aucune logique d'affichage
-- reelle, seulement la preference de l'utilisateur -- la visibilite en elle-meme viendra plus tard.
alter table public.profiles add column if not exists visible_email boolean not null default true;
alter table public.profiles add column if not exists visible_telephone boolean not null default true;
alter table public.profiles add column if not exists visible_adresse boolean not null default true;
alter table public.profiles add column if not exists visible_date_naissance boolean not null default true;

-- Compte "administrateur" : bypass toutes les verifications bureau/responsable d'equipe, sur tous
-- les clubs, tout le temps (voir is_app_admin() plus bas, utilise par is_club_bureau() et
-- is_team_manager()). Volontairement IRREVOCABLE depuis l'app -- aucune case a cocher nulle part ne
-- pilote ce champ, seul un acces direct a la base (SQL Supabase) peut l'activer/desactiver. Sert de
-- filet de securite en cas d'auto-exclusion accidentelle du bureau (role_membre_bureau decoche par
-- erreur, plus personne pour le reactiver depuis l'app).
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_app_admin() to authenticated;

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

-- Statut administratif (onglet Tableau de bord > Administratif, lecture seule pour le membre) :
-- saisi par le bureau via l'onglet Gestion club.
alter table public.club_members add column if not exists licence_a_jour boolean not null default false;
alter table public.club_members add column if not exists dette numeric(10, 2) not null default 0;

-- Un membre qui rejoint un club via la recherche part non valide (voir js/club.js) ; le createur
-- d'un club est valide d'office. Le bureau confirme les nouveaux arrivants via "Valider membre"
-- dans l'onglet Gestion club (voir js/club-management.js). Defaut a true pour ne pas invalider
-- retroactivement les appartenances deja existantes sur un projet en cours.
alter table public.club_members add column if not exists valide boolean not null default true;

alter table public.club_members enable row level security;

-- "Le bureau voit/gere tous les membres de son club" a besoin de verifier, DANS une policy sur
-- club_members, si l'appelant est bureau -- en interrogeant club_members lui-meme. Une sous-requete
-- directe declenche une recursion infinie (Postgres reapplique la policy a chaque ligne testee,
-- qui reteste la policy, etc. -- erreur reelle rencontree : "infinite recursion detected in
-- policy for relation club_members"). SECURITY DEFINER contourne le probleme : la fonction
-- s'execute avec les droits de son proprietaire (qui bypasse RLS), donc plus de recursion.
create or replace function public.is_club_bureau(target_club_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_app_admin() or exists (
    select 1 from public.club_members
    where club_id = target_club_id and user_id = auth.uid() and role_membre_bureau = true
  );
$$;

grant execute on function public.is_club_bureau(uuid) to authenticated;

-- Un membre du bureau doit pouvoir voir tous les membres de son club (pas seulement lui-meme)
-- pour les ecrans de l'onglet Gestion club (liste des membres, validation, roles).
drop policy if exists "Les utilisateurs lisent leurs propres appartenances" on public.club_members;
drop policy if exists "Les membres du bureau lisent tous les membres de leur club" on public.club_members;
create policy "Les membres du bureau lisent tous les membres de leur club"
  on public.club_members for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_club_bureau(club_id)
  );

drop policy if exists "Les utilisateurs rejoignent un club en leur nom" on public.club_members;
create policy "Les utilisateurs rejoignent un club en leur nom"
  on public.club_members for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Un membre du bureau peut valider un nouvel arrivant et gerer les roles (encadrant, membre du
-- bureau) de n'importe quel membre de son club -- voir l'onglet Gestion club.
drop policy if exists "Les membres du bureau modifient les membres de leur club" on public.club_members;
create policy "Les membres du bureau modifient les membres de leur club"
  on public.club_members for update
  to authenticated
  using (public.is_club_bureau(club_id))
  with check (public.is_club_bureau(club_id));

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

-- La creation d'equipe se fait desormais cote bureau, depuis Gestion club (voir
-- js/club-management.js) : le bureau choisit qui en devient responsable, pas forcement lui-meme.
drop policy if exists "Les encadrants creent une equipe dans leur club" on public.teams;
drop policy if exists "Le bureau cree une equipe dans son club" on public.teams;
create policy "Le bureau cree une equipe dans son club"
  on public.teams for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_bureau(teams.club_id)
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

-- Un responsable d'equipe est identifie soit a la creation de l'equipe (choisi par le bureau, voir
-- js/club-management.js), soit par un AUTRE responsable de cette meme equipe (voir "Gerer les
-- responsables" dans js/team-detail.js) -- il n'y a plus de role "encadrant" club-wide (retire de
-- Gestion club). SECURITY DEFINER pour eviter la recursion en s'auto-referencant dans sa propre
-- policy (meme raison que is_club_bureau plus haut).
create or replace function public.is_team_manager(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_app_admin() or exists (
    select 1 from public.team_managers
    where team_id = target_team_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_team_manager(uuid) to authenticated;

drop policy if exists "Un encadrant s'ajoute comme responsable d'equipe" on public.team_managers;
drop policy if exists "Les encadrants gerent les responsables d'equipe (ajout)" on public.team_managers;
create policy "Les encadrants gerent les responsables d'equipe (ajout)"
  on public.team_managers for insert
  to authenticated
  with check (
    public.is_team_manager(team_managers.team_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_managers.team_id and public.is_club_bureau(t.club_id)
    )
  );

drop policy if exists "Les encadrants gerent les responsables d'equipe (retrait)" on public.team_managers;
create policy "Les encadrants gerent les responsables d'equipe (retrait)"
  on public.team_managers for delete
  to authenticated
  using (
    public.is_team_manager(team_managers.team_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_managers.team_id and public.is_club_bureau(t.club_id)
    )
  );

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

-- Le bureau peut ajouter un membre a une equipe (necessaire pour y placer le responsable choisi a
-- la creation, voir js/club-management.js), tout comme un responsable de cette equipe au fil de sa
-- vie (voir "Ajouter des membres" dans js/team-detail.js).
drop policy if exists "Les encadrants ajoutent des membres a l'equipe" on public.team_members;
create policy "Les encadrants ajoutent des membres a l'equipe"
  on public.team_members for insert
  to authenticated
  with check (
    public.is_team_manager(team_members.team_id)
    or exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and public.is_club_bureau(t.club_id)
    )
  );

-- --- Evenements d'equipe ----------------------------------------
-- Un evenement appartient a une equipe. Cyclique = hebdomadaire ; dans ce cas la date de derniere
-- occurrence est obligatoire (verifie aussi cote base, pas seulement cote app). "demande
-- confirmation" ne pilote encore aucune logique -- son usage sera defini plus tard. Affiche comme
-- un point dans l'onglet Calendrier de chaque membre de l'equipe (voir js/calendar.js).

create table if not exists public.team_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  nom text not null,
  date_debut date not null,
  date_fin date not null,
  heure_debut time not null,
  heure_fin time not null,
  lieu text,
  commentaire text,
  cyclique boolean not null default false,
  date_derniere_occurrence date,
  demande_confirmation boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- Lieu, date de fin et heure de fin sont devenus facultatifs cote app (fin = debut si non
-- renseigne) ; au cas ou la table existait deja avec lieu en NOT NULL, on leve la contrainte.
alter table public.team_events alter column lieu drop not null;

alter table public.team_events drop constraint if exists team_events_cyclique_check;
alter table public.team_events add constraint team_events_cyclique_check
  check (not cyclique or date_derniere_occurrence is not null);

alter table public.team_events enable row level security;

drop policy if exists "Les membres du club lisent les evenements d'equipe" on public.team_events;
create policy "Les membres du club lisent les evenements d'equipe"
  on public.team_events for select
  to authenticated
  using (exists (
    select 1 from public.teams t
    join public.club_members cm on cm.club_id = t.club_id
    where t.id = team_events.team_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les encadrants creent un evenement d'equipe" on public.team_events;
create policy "Les encadrants creent un evenement d'equipe"
  on public.team_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_team_manager(team_events.team_id)
  );

-- --- Selections d'equipe -----------------------------------------
-- Une selection appartient a une equipe : pour l'instant juste une date limite de candidature et
-- un commentaire libre. Utilisee plus tard dans l'onglet Saison -- pour l'instant, seule sa
-- creation existe.

create table if not exists public.team_selections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  date_limite_candidature date not null,
  commentaire text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.team_selections enable row level security;

drop policy if exists "Les membres du club lisent les selections d'equipe" on public.team_selections;
create policy "Les membres du club lisent les selections d'equipe"
  on public.team_selections for select
  to authenticated
  using (exists (
    select 1 from public.teams t
    join public.club_members cm on cm.club_id = t.club_id
    where t.id = team_selections.team_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les encadrants creent une selection d'equipe" on public.team_selections;
create policy "Les encadrants creent une selection d'equipe"
  on public.team_selections for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_team_manager(team_selections.team_id)
  );

-- --- Evenements de club (onglet Gestion club, reserve au bureau) ------
-- Equivalent de team_events mais a l'echelle de tout le club (pas une seule equipe) : visible par
-- tous les membres du club dans leur calendrier (voir js/calendar.js).

create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  nom text not null,
  date_debut date not null,
  date_fin date not null,
  heure_debut time not null,
  heure_fin time not null,
  lieu text,
  commentaire text,
  cyclique boolean not null default false,
  date_derniere_occurrence date,
  demande_confirmation boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- Lieu, date de fin et heure de fin sont devenus facultatifs cote app (fin = debut si non
-- renseigne) ; au cas ou la table existait deja avec lieu en NOT NULL, on leve la contrainte.
alter table public.club_events alter column lieu drop not null;

alter table public.club_events drop constraint if exists club_events_cyclique_check;
alter table public.club_events add constraint club_events_cyclique_check
  check (not cyclique or date_derniere_occurrence is not null);

-- Case "Bureau uniquement" a la creation (voir js/club-event-create.js) : sert pour l'instant de
-- filtre dans la liste "Evenement club" (voir js/club-management.js). Ne restreint pas encore la
-- visibilite de l'evenement dans le calendrier/Saison des membres non-bureau -- a faire plus tard
-- si besoin.
alter table public.club_events add column if not exists bureau_uniquement boolean not null default false;

alter table public.club_events enable row level security;

drop policy if exists "Les membres du club lisent les evenements du club" on public.club_events;
create policy "Les membres du club lisent les evenements du club"
  on public.club_events for select
  to authenticated
  using (exists (
    select 1 from public.club_members cm
    where cm.club_id = club_events.club_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Le bureau cree un evenement de club" on public.club_events;
create policy "Le bureau cree un evenement de club"
  on public.club_events for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_bureau(club_events.club_id)
  );

-- --- Communications de club (redigees depuis Gestion club, reserve au bureau) --
-- Un message publie par un membre du bureau, visible par TOUS les membres du club (pas seulement
-- le bureau) -- l'usage/emplacement d'affichage futur en dehors de Gestion club reste a definir.

create table if not exists public.club_communications (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  message text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.club_communications enable row level security;

drop policy if exists "Le bureau lit les communications de son club" on public.club_communications;
drop policy if exists "Les membres du club lisent les communications de leur club" on public.club_communications;
create policy "Les membres du club lisent les communications de leur club"
  on public.club_communications for select
  to authenticated
  using (exists (
    select 1 from public.club_members cm
    where cm.club_id = club_communications.club_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Le bureau cree une communication de club" on public.club_communications;
create policy "Le bureau cree une communication de club"
  on public.club_communications for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_bureau(club_communications.club_id)
  );

-- Marqueur "derniere lecture des communications" par utilisateur et par club : sert uniquement au
-- point rouge de l'icone flottante (une communication est "non lue" si elle est plus recente que ce
-- marqueur). Mis a jour (upsert) des que l'utilisateur ouvre l'ecran Communications -- voir
-- js/communications.js.
create table if not exists public.communication_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

alter table public.communication_reads enable row level security;

drop policy if exists "Les utilisateurs lisent leur marqueur de lecture" on public.communication_reads;
create policy "Les utilisateurs lisent leur marqueur de lecture"
  on public.communication_reads for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Les utilisateurs creent leur marqueur de lecture" on public.communication_reads;
create policy "Les utilisateurs creent leur marqueur de lecture"
  on public.communication_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Les utilisateurs modifient leur marqueur de lecture" on public.communication_reads;
create policy "Les utilisateurs modifient leur marqueur de lecture"
  on public.communication_reads for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- Confirmations de presence et candidatures (option "demander confirmation", selections) ------
-- Reponse d'un membre a un evenement ("present" = true/false) ou candidature a une selection
-- (l'existence de la ligne suffit). Repondu/candidate depuis l'onglet Saison (voir js/saison.js) ;
-- visible par les encadrants/le bureau depuis le detail d'equipe / Gestion club (voir
-- js/team-detail.js et js/club-management.js, boutons "Voir les evenements"/"Gerer les selections").

create table if not exists public.team_event_confirmations (
  team_event_id uuid not null references public.team_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  present boolean not null,
  responded_at timestamptz not null default now(),
  primary key (team_event_id, user_id)
);

alter table public.team_event_confirmations enable row level security;

drop policy if exists "Les membres du club lisent les confirmations d'evenement d'equipe" on public.team_event_confirmations;
create policy "Les membres du club lisent les confirmations d'evenement d'equipe"
  on public.team_event_confirmations for select
  to authenticated
  using (exists (
    select 1 from public.team_events te
    join public.teams t on t.id = te.team_id
    join public.club_members cm on cm.club_id = t.club_id
    where te.id = team_event_confirmations.team_event_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les membres de l'equipe repondent pour eux-memes (creation)" on public.team_event_confirmations;
create policy "Les membres de l'equipe repondent pour eux-memes (creation)"
  on public.team_event_confirmations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.team_events te
      join public.team_members tm on tm.team_id = te.team_id
      where te.id = team_event_confirmations.team_event_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Les membres de l'equipe modifient leur propre reponse" on public.team_event_confirmations;
create policy "Les membres de l'equipe modifient leur propre reponse"
  on public.team_event_confirmations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.club_event_confirmations (
  club_event_id uuid not null references public.club_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  present boolean not null,
  responded_at timestamptz not null default now(),
  primary key (club_event_id, user_id)
);

alter table public.club_event_confirmations enable row level security;

drop policy if exists "Les membres du club lisent les confirmations d'evenement de club" on public.club_event_confirmations;
create policy "Les membres du club lisent les confirmations d'evenement de club"
  on public.club_event_confirmations for select
  to authenticated
  using (exists (
    select 1 from public.club_events ce
    join public.club_members cm on cm.club_id = ce.club_id
    where ce.id = club_event_confirmations.club_event_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les membres du club repondent pour eux-memes (creation)" on public.club_event_confirmations;
create policy "Les membres du club repondent pour eux-memes (creation)"
  on public.club_event_confirmations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.club_events ce
      join public.club_members cm on cm.club_id = ce.club_id
      where ce.id = club_event_confirmations.club_event_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Les membres du club modifient leur propre reponse" on public.club_event_confirmations;
create policy "Les membres du club modifient leur propre reponse"
  on public.club_event_confirmations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.team_selection_candidatures (
  selection_id uuid not null references public.team_selections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (selection_id, user_id)
);

alter table public.team_selection_candidatures enable row level security;

drop policy if exists "Les membres du club lisent les candidatures de selection" on public.team_selection_candidatures;
create policy "Les membres du club lisent les candidatures de selection"
  on public.team_selection_candidatures for select
  to authenticated
  using (exists (
    select 1 from public.team_selections ts
    join public.teams t on t.id = ts.team_id
    join public.club_members cm on cm.club_id = t.club_id
    where ts.id = team_selection_candidatures.selection_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les membres de l'equipe candidatent pour eux-memes" on public.team_selection_candidatures;
create policy "Les membres de l'equipe candidatent pour eux-memes"
  on public.team_selection_candidatures for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.team_selections ts
      join public.team_members tm on tm.team_id = ts.team_id
      where ts.id = team_selection_candidatures.selection_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Les membres retirent leur propre candidature" on public.team_selection_candidatures;
create policy "Les membres retirent leur propre candidature"
  on public.team_selection_candidatures for delete
  to authenticated
  using (user_id = auth.uid());
