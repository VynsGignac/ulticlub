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

-- Genre : obligatoire a la creation du compte (voir le formulaire d'inscription), toujours visible
-- par tout le monde -- pas de case "visible par les membres hors du bureau" comme pour
-- email/telephone/adresse/date de naissance. "Ne se prononce pas" sert aussi de valeur de repli
-- pour les comptes crees avant l'ajout de cette colonne.
alter table public.profiles add column if not exists genre text;
update public.profiles set genre = 'Ne se prononce pas' where genre is null;
alter table public.profiles alter column genre set default 'Ne se prononce pas';
alter table public.profiles alter column genre set not null;
alter table public.profiles drop constraint if exists profiles_genre_check;
alter table public.profiles add constraint profiles_genre_check
  check (genre in ('Féminin', 'Masculin', 'Ne se prononce pas'));

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
-- bouton pour en quitter un ou basculer vers un autre). Exactement 2 roles possibles par
-- appartenance (refonte 2026-10-26, l'ancien role "encadrant" est retire -- voir plus bas) :
-- "licencié" est le role de base, implicite, rien a stocker pour lui ; "membre du bureau"
-- (role_membre_bureau) donne acces aux ecrans d'administration du club. Le createur d'un club est
-- membre du bureau des la creation.

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid not null references public.clubs (id) on delete cascade,
  role_membre_bureau boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, club_id)
);

-- Role "encadrant" retire (refonte des roles, 2026-10-26) : il ne pilotait plus aucun acces depuis
-- le retrait de l'onglet "Gestion equipe" de la barre principale -- seuls "licencié" (implicite) et
-- "membre du bureau" subsistent desormais. Les lignes existantes restent intactes, seule la colonne
-- disparait.
alter table public.club_members drop column if exists role_encadrant;

-- Statut administratif (onglet Tableau de bord > Administratif, lecture seule pour le membre) :
-- saisi par le bureau via l'onglet Gestion club.
alter table public.club_members add column if not exists licence_a_jour boolean not null default false;
alter table public.club_members add column if not exists dette numeric(10, 2) not null default 0;

-- Roles legaux (onglet Bureau > Membre du bureau, voir js/bureau.js) : president / secretaire /
-- tresorier. CUMULATIFS (refonte 2026-10-26) -- un meme membre peut cumuler les 3 -- plutot qu'une
-- seule colonne "role_legal" (abandonnee) qui ne pouvait en retenir qu'un seul a la fois : nommer
-- quelqu'un titulaire d'un role EFFACAIT silencieusement tout autre role legal qu'il detenait deja
-- (bug reel : B secretaire nomme tresorier perdait sa qualite de secretaire, qui devenait vacant --
-- aucun membre ne le detenait plus). Avec 3 colonnes booleennes independantes, transferer un role
-- ne touche jamais aux autres roles du nouveau titulaire : les 3 restent donc TOUJOURS attribues.
-- Transferer un role legal (le retirer a son titulaire actuel pour le donner a un autre membre du
-- bureau, en une seule operation, sans toucher a ses autres roles) est reserve au president --
-- seulement cote interface pour l'instant (comme bureau_uniquement/responsable_uniquement ailleurs
-- dans ce fichier) : la policy RLS ci-dessous reste large (tout le bureau), a durcir plus tard si
-- besoin.
alter table public.club_members add column if not exists role_president boolean not null default false;
alter table public.club_members add column if not exists role_secretaire boolean not null default false;
alter table public.club_members add column if not exists role_tresorier boolean not null default false;

-- Migration depuis l'ancienne colonne unique "role_legal" (une seule valeur a la fois) si elle
-- existe encore -- reporte son contenu sur les 3 nouvelles colonnes avant de la supprimer. Sans
-- effet si deja fait (la colonne n'existe alors plus).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'club_members' and column_name = 'role_legal'
  ) then
    update public.club_members set role_president = true where role_legal = 'president';
    update public.club_members set role_secretaire = true where role_legal = 'secretaire';
    update public.club_members set role_tresorier = true where role_legal = 'tresorier';
    alter table public.club_members drop constraint if exists club_members_role_legal_check;
    alter table public.club_members drop constraint if exists club_members_role_legal_requires_bureau;
    drop index if exists club_members_role_legal_unique;
    alter table public.club_members drop column role_legal;
  end if;
end $$;

alter table public.club_members drop constraint if exists club_members_roles_legaux_requierent_bureau;
alter table public.club_members add constraint club_members_roles_legaux_requierent_bureau
  check (
    (not role_president and not role_secretaire and not role_tresorier)
    or role_membre_bureau = true
  );

-- Un seul titulaire par role et par club (chaque role a son propre index unique partiel : au plus
-- une ligne a role_president = true par club, au plus une a role_secretaire = true, etc. -- mais
-- rien n'empeche la MEME ligne d'avoir plusieurs de ces colonnes a true en meme temps).
create unique index if not exists club_members_role_president_unique
  on public.club_members (club_id) where role_president;
create unique index if not exists club_members_role_secretaire_unique
  on public.club_members (club_id) where role_secretaire;
create unique index if not exists club_members_role_tresorier_unique
  on public.club_members (club_id) where role_tresorier;

-- Seed ponctuel (2026-10-26) : nomme le compte vincent.gibier23@gmail.com president de son club
-- actif, s'il n'est pas deja titulaire d'un role legal. Idempotent et sans effet sur tout autre
-- compte.
do $$
begin
  update public.club_members cm
  set role_president = true
  from public.profiles p, auth.users u
  where cm.user_id = p.id
    and p.id = u.id
    and u.email = 'vincent.gibier23@gmail.com'
    and cm.club_id = p.active_club_id
    and not cm.role_president and not cm.role_secretaire and not cm.role_tresorier;
end $$;

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

-- Un membre du bureau peut valider un nouvel arrivant et gerer le role membre du bureau de
-- n'importe quel membre de son club.
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

-- --- Equipes ---
-- Une equipe appartient a un seul club et se definit par 4 champs obligatoires (categorie,
-- section, division, surface). Son nom est pre-rempli a partir de ces champs ("Section Categorie
-- Division Surface", ex. "Adulte Open D1 Outdoor") cote app (voir js/club-management.js), mais
-- reste modifiable par l'utilisateur avant la creation -- ce n'est donc plus une colonne generee
-- automatiquement. Unique dans son club, insensible a la casse (mais deux clubs peuvent chacun
-- avoir une equipe portant le meme nom).

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  categorie text not null,
  section text not null,
  division text not null,
  surface text not null,
  nom text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- Migration pour un projet ayant deja "nom" en GENERATED ALWAYS AS (ancien comportement, derive
-- automatiquement et non modifiable) : le convertit en colonne normale en conservant la valeur
-- actuelle de chaque equipe existante. Sans effet si deja fait (nom est deja une colonne normale).
do $$
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.teams'::regclass
      and attname = 'nom'
      and attgenerated = 's'
  ) then
    drop index if exists teams_nom_unique_ci;
    alter table public.teams rename column nom to nom_ancien_genere;
    alter table public.teams add column nom text;
    update public.teams set nom = nom_ancien_genere;
    alter table public.teams drop column nom_ancien_genere;
  end if;
end $$;

-- Migration pour un projet ayant deja la table teams sous son ancienne forme (nom en texte
-- libre) : ajoute les 4 champs structures, les remplit avec des valeurs de repli pour les lignes
-- existantes (aucune ne devrait exister a ce stade) -- sans effet si deja fait. Le nom existant
-- (texte libre) est conserve tel quel pour ces lignes (coalesce ci-dessous), plutot que remplace.
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
  end if;
end $$;

-- Garantit que nom est toujours rempli (equipes creees avant l'ajout de cette colonne, ou par une
-- des migrations ci-dessus qui la laisse nulle) avant d'exiger NOT NULL.
update public.teams set nom = section || ' ' || categorie || ' ' || division || ' ' || surface
where nom is null;
alter table public.teams alter column nom set not null;

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

-- Case "Responsables uniquement" a la creation (voir js/team-detail.js) : equivalent de
-- club_events.bureau_uniquement, mais a l'echelle de l'equipe -- sert de filtre dans la liste
-- "Evenement equipe".
alter table public.team_events add column if not exists responsable_uniquement boolean not null default false;

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

-- Portee de la selection (voir js/selection-create.js) : au moins Homme ou Femme doit etre coche
-- (les 2 peuvent l'etre -- dans ce cas la selection est ouverte a tout le monde quel que soit le
-- genre, voir le filtrage cote app dans js/saison.js). Les 2 bornes de date de naissance sont
-- optionnelles et cumulables (une tranche d'age). Par defaut (selections creees avant cette
-- fonctionnalite), les 2 genres sont cibles et aucune borne de date n'est posee -- equivalent a
-- "ouvert a tout le monde", le comportement d'avant.
alter table public.team_selections add column if not exists cible_masculin boolean not null default true;
alter table public.team_selections add column if not exists cible_feminin boolean not null default true;
alter table public.team_selections add column if not exists nee_avant_le date;
alter table public.team_selections add column if not exists nee_apres_le date;

alter table public.team_selections drop constraint if exists team_selections_cible_check;
alter table public.team_selections add constraint team_selections_cible_check
  check (cible_masculin or cible_feminin);

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

-- Marqueur "derniere lecture" de l'onglet Saison, par utilisateur ET par sous-onglet
-- (evenement/selection, voir js/saison.js) : sert au point rouge "nouvel element" sur l'onglet
-- Saison, chaque sous-onglet, et chaque element de la liste (nouveau si sa date de creation est
-- posterieure a ce marqueur) -- meme principe que communication_reads plus haut, mais par
-- sous-onglet plutot que par club puisque Saison agrege toutes les equipes/clubs de l'utilisateur.
create table if not exists public.saison_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  sous_onglet text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, sous_onglet)
);

alter table public.saison_reads drop constraint if exists saison_reads_sous_onglet_check;
alter table public.saison_reads add constraint saison_reads_sous_onglet_check
  check (sous_onglet in ('evenement', 'selection'));

alter table public.saison_reads enable row level security;

drop policy if exists "Les utilisateurs lisent leur marqueur de saison" on public.saison_reads;
create policy "Les utilisateurs lisent leur marqueur de saison"
  on public.saison_reads for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Les utilisateurs creent leur marqueur de saison" on public.saison_reads;
create policy "Les utilisateurs creent leur marqueur de saison"
  on public.saison_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Les utilisateurs modifient leur marqueur de saison" on public.saison_reads;
create policy "Les utilisateurs modifient leur marqueur de saison"
  on public.saison_reads for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- Projets de club (bouton "Projet" dans Gestion club, onglet "Vie de club") ------------------
-- Contrairement a un evenement, un projet n'a ni date, ni heure, ni lieu : juste un nom et un
-- commentaire libre, cree par le bureau. Visible ensuite par TOUS les membres du club dans l'onglet
-- "Vie de club" (voir js/vie-club.js), qui peuvent rejoindre/quitter le projet librement.

create table if not exists public.club_projects (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  nom text not null,
  commentaire text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- Statut d'avancement, modifiable par n'importe quel participant du projet (voir js/vie-club.js) --
-- pas reserve au bureau qui l'a cree. "Non démarré" par defaut pour un projet tout juste cree.
alter table public.club_projects add column if not exists statut text not null default 'Non démarré';
alter table public.club_projects drop constraint if exists club_projects_statut_check;
alter table public.club_projects add constraint club_projects_statut_check
  check (statut in ('Non démarré', 'Amorcé', 'En cours', 'Terminé'));

alter table public.club_projects enable row level security;

drop policy if exists "Les membres du club lisent les projets de leur club" on public.club_projects;
create policy "Les membres du club lisent les projets de leur club"
  on public.club_projects for select
  to authenticated
  using (exists (
    select 1 from public.club_members cm
    where cm.club_id = club_projects.club_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Le bureau cree un projet de club" on public.club_projects;
create policy "Le bureau cree un projet de club"
  on public.club_projects for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_bureau(club_projects.club_id)
  );

-- Une fois un projet rejoint, n'importe quel participant peut modifier son commentaire et faire
-- evoluer son statut (voir js/vie-club.js) -- ouvert a tout participant, pas seulement au bureau.
drop policy if exists "Les participants d'un projet modifient son commentaire et son statut" on public.club_projects;
create policy "Les participants d'un projet modifient son commentaire et son statut"
  on public.club_projects for update
  to authenticated
  using (exists (
    select 1 from public.club_project_members cpm
    where cpm.project_id = club_projects.id and cpm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.club_project_members cpm
    where cpm.project_id = club_projects.id and cpm.user_id = auth.uid()
  ));

-- Participants a un projet : rejoindre/quitter est ouvert a tout membre du club concerne, pas
-- seulement au bureau (voir le bouton "Rejoindre"/"Quitter" dans js/vie-club.js).

create table if not exists public.club_project_members (
  project_id uuid not null references public.club_projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.club_project_members enable row level security;

drop policy if exists "Les membres du club lisent les participants aux projets" on public.club_project_members;
create policy "Les membres du club lisent les participants aux projets"
  on public.club_project_members for select
  to authenticated
  using (exists (
    select 1 from public.club_projects cp
    join public.club_members cm on cm.club_id = cp.club_id
    where cp.id = club_project_members.project_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les membres du club rejoignent un projet" on public.club_project_members;
create policy "Les membres du club rejoignent un projet"
  on public.club_project_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.club_projects cp
      join public.club_members cm on cm.club_id = cp.club_id
      where cp.id = club_project_members.project_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Les membres quittent un projet" on public.club_project_members;
create policy "Les membres quittent un projet"
  on public.club_project_members for delete
  to authenticated
  using (user_id = auth.uid());

-- --- Licencies (onglet Administratif > Liste des membres, reserve au bureau) ---------------------
-- Roster officiel du club (nom, prenom, date de naissance, categorie, equipe, numero de licence,
-- telephone, mail), saisi et tenu a jour a la main par le bureau -- voir js/administratif.js.
-- VOLONTAIREMENT SANS LIEN avec les comptes de l'app (profiles/club_members) : un licencie du club
-- n'a pas forcement de compte sur l'app, et inversement. Donnees sensibles (date de naissance,
-- telephone, mail) : lecture et ecriture reservees au bureau du club, contrairement a la plupart des
-- autres tables ou tous les membres du club peuvent au moins lire.

create table if not exists public.club_licencies (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  nom text not null,
  prenom text,
  date_naissance date,
  categorie text,
  equipe text,
  licence text,
  telephone text,
  mail text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.club_licencies enable row level security;

drop policy if exists "Le bureau lit les licencies de son club" on public.club_licencies;
create policy "Le bureau lit les licencies de son club"
  on public.club_licencies for select
  to authenticated
  using (public.is_club_bureau(club_id));

drop policy if exists "Le bureau ajoute un licencie dans son club" on public.club_licencies;
create policy "Le bureau ajoute un licencie dans son club"
  on public.club_licencies for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_bureau(club_id)
  );

drop policy if exists "Le bureau modifie les licencies de son club" on public.club_licencies;
create policy "Le bureau modifie les licencies de son club"
  on public.club_licencies for update
  to authenticated
  using (public.is_club_bureau(club_id))
  with check (public.is_club_bureau(club_id));

drop policy if exists "Le bureau supprime un licencie de son club" on public.club_licencies;
create policy "Le bureau supprime un licencie de son club"
  on public.club_licencies for delete
  to authenticated
  using (public.is_club_bureau(club_id));

-- --- Projets par domaine (onglets Sport / Kid / Vie Associative) ---------------------------------
-- Les 3 onglets partagent exactement le meme mecanisme (voir js/club-initiatives.js), seule la
-- colonne "domaine" les distingue. Listes par echeance la plus proche ; seuls nom et echeance
-- apparaissent dans la liste, le reste (porteur, description, statut, periodicite) dans le detail.
-- Ouvert a tout membre du club (lecture ET ecriture), pas reserve au bureau -- contrairement a
-- club_licencies, rien ici n'est une donnee personnelle sensible.

create table if not exists public.club_initiatives (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  domaine text not null,
  nom text not null,
  porteur text,
  echeance date not null,
  description text,
  statut text not null default 'Non démarré',
  periodicite text not null default 'Ponctuel',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.club_initiatives drop constraint if exists club_initiatives_domaine_check;
alter table public.club_initiatives add constraint club_initiatives_domaine_check
  check (domaine in ('sport', 'kid', 'vie_associative'));

alter table public.club_initiatives drop constraint if exists club_initiatives_statut_check;
alter table public.club_initiatives add constraint club_initiatives_statut_check
  check (statut in ('Non démarré', 'Amorcé', 'En cours', 'Terminé'));

alter table public.club_initiatives drop constraint if exists club_initiatives_periodicite_check;
alter table public.club_initiatives add constraint club_initiatives_periodicite_check
  check (periodicite in ('Ponctuel', 'Hebdomadaire', 'Mensuel', 'Trimestriel', 'Annuel'));

alter table public.club_initiatives enable row level security;

drop policy if exists "Les membres du club lisent les projets de leur club" on public.club_initiatives;
create policy "Les membres du club lisent les projets de leur club"
  on public.club_initiatives for select
  to authenticated
  using (exists (
    select 1 from public.club_members cm
    where cm.club_id = club_initiatives.club_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Les membres du club creent un projet dans leur club" on public.club_initiatives;
create policy "Les membres du club creent un projet dans leur club"
  on public.club_initiatives for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.club_members cm
      where cm.club_id = club_initiatives.club_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Les membres du club modifient les projets de leur club" on public.club_initiatives;
create policy "Les membres du club modifient les projets de leur club"
  on public.club_initiatives for update
  to authenticated
  using (exists (
    select 1 from public.club_members cm
    where cm.club_id = club_initiatives.club_id and cm.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.club_members cm
    where cm.club_id = club_initiatives.club_id and cm.user_id = auth.uid()
  ));

-- --- Membres de commission (colonne de gauche des onglets Sport / Kid / Vie Associative) ---------
-- Qui fait partie de la "commission" de ce domaine, et qui en est responsable (mis en evidence en
-- haut de la liste, voir js/club-initiatives.js). Les membres sont choisis dans le roster
-- club_licencies (onglet Administratif), PAS dans les comptes de l'app. nom/prenom sont dupliques
-- ici au moment de l'ajout (plutot qu'un JOIN vers club_licencies a la lecture) car club_licencies
-- est reservee au bureau (donnees sensibles) alors que cette liste doit etre visible par tout le
-- monde sur ces onglets -- un JOIN la bloquerait pour les non-bureau. Ajouter/retirer un membre ou
-- le nommer responsable necessite donc deja de pouvoir lire club_licencies pour choisir qui ajouter
-- : ces 3 actions sont de fait reservees au bureau, meme si le reste de l'onglet (projets) reste
-- ouvert a tous.

create table if not exists public.club_commission_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  domaine text not null,
  licencie_id uuid not null references public.club_licencies (id) on delete cascade,
  nom text not null,
  prenom text,
  responsable boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (domaine, licencie_id)
);

alter table public.club_commission_members drop constraint if exists club_commission_members_domaine_check;
alter table public.club_commission_members add constraint club_commission_members_domaine_check
  check (domaine in ('sport', 'kid', 'vie_associative'));

alter table public.club_commission_members enable row level security;

drop policy if exists "Les membres du club lisent les membres de commission" on public.club_commission_members;
create policy "Les membres du club lisent les membres de commission"
  on public.club_commission_members for select
  to authenticated
  using (exists (
    select 1 from public.club_members cm
    where cm.club_id = club_commission_members.club_id and cm.user_id = auth.uid()
  ));

drop policy if exists "Le bureau ajoute un membre de commission" on public.club_commission_members;
create policy "Le bureau ajoute un membre de commission"
  on public.club_commission_members for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_club_bureau(club_id)
  );

drop policy if exists "Le bureau modifie un membre de commission" on public.club_commission_members;
create policy "Le bureau modifie un membre de commission"
  on public.club_commission_members for update
  to authenticated
  using (public.is_club_bureau(club_id))
  with check (public.is_club_bureau(club_id));

drop policy if exists "Le bureau retire un membre de commission" on public.club_commission_members;
create policy "Le bureau retire un membre de commission"
  on public.club_commission_members for delete
  to authenticated
  using (public.is_club_bureau(club_id));
