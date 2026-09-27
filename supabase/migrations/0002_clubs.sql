-- ============================================================
-- Ajoute les clubs : un profil peut appartenir a un club (profiles.club_id), recherchable par
-- nom, avec creation si aucun club existant ne correspond (nom unique, insensible a la casse).
-- A coller une fois dans le SQL Editor du projet Supabase existant.
-- ============================================================

create extension if not exists pgcrypto;

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

alter table public.profiles add column club_id uuid references public.clubs (id);

-- Necessaire pour rejoindre/creer un club (mise a jour de son propre profil) : aucune policy
-- UPDATE n'existait encore sur profiles jusqu'ici.
create policy "Les utilisateurs modifient leur propre profil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
