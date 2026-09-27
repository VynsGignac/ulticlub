// ============================================================
// Configuration Supabase -- URL et cle publique ("anon") du projet.
// La cle anon n'EST PAS un secret (elle est concue pour etre visible cote client, contrairement
// au webhook Discord) : la securite vient des policies RLS definies dans supabase/schema.sql,
// pas de la confidentialite de cette cle. Peut donc etre commitee sans risque.
//
// A remplacer par les valeurs de ton projet : sur supabase.com, Project Settings > API.
// ============================================================

const SUPABASE_URL = 'https://TON-PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'colle-ta-cle-anon-ici';
