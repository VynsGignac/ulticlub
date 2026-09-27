-- ============================================================
-- Schema du compte utilisateur UltiClub (profil + connexion par pseudo).
-- A executer une fois dans le SQL Editor du projet Supabase (supabase.com > ton projet > SQL
-- Editor > New query > coller ce fichier > Run).
--
-- Supabase Auth gere nativement email + mot de passe (table auth.users, mots de passe hashes).
-- Le "profil" du menu de connexion est le pseudo, pas l'email : la fonction email_for_pseudo
-- ci-dessous fait la correspondance pseudo -> email pour permettre la connexion par pseudo tout
-- en s'appuyant sur l'authentification standard de Supabase.
-- ============================================================

-- Informations de profil complementaires (nom, pseudo, telephone) liees a chaque compte auth.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null,
  pseudo text not null unique,
  telephone text not null,
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

-- Correspondance pseudo -> email, utilisee au moment de la connexion (avant que l'utilisateur
-- soit authentifie, donc pas de session pour s'appuyer sur les policies ci-dessus). SECURITY
-- DEFINER + un search_path fixe permet de lire auth.users sans exposer toute la table : la
-- fonction ne renvoie qu'un email, jamais plus, et seulement si le pseudo existe.
create or replace function public.email_for_pseudo(pseudo_input text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.pseudo = pseudo_input
  limit 1;
$$;

grant execute on function public.email_for_pseudo(text) to anon, authenticated;
