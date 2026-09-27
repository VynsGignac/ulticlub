-- ============================================================
-- Migration pour un projet ayant deja execute l'ancien supabase/schema.sql (connexion par pseudo
-- + telephone obligatoire). A coller une fois dans le SQL Editor du projet Supabase existant.
--
-- Change : la connexion se fait desormais avec l'email saisi directement (plus besoin de
-- retrouver l'email a partir du pseudo), et le telephone n'est plus demande a l'inscription.
-- ============================================================

alter table public.profiles drop column if exists telephone;
drop function if exists public.email_for_pseudo(text);
