// ============================================================
// Configuration Supabase -- URL et cle publique ("anon") du projet.
// La cle anon n'EST PAS un secret (elle est concue pour etre visible cote client, contrairement
// au webhook Discord) : la securite vient des policies RLS definies dans supabase/schema.sql,
// pas de la confidentialite de cette cle. Peut donc etre commitee sans risque.
//
// A remplacer par les valeurs de ton projet : sur supabase.com, Project Settings > API.
// ============================================================

const SUPABASE_URL = 'https://bvxqtfhrvahbqfkimsht.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2eHF0ZmhydmFoYnFma2ltc2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0OTQ3NTgsImV4cCI6MjEwNjA3MDc1OH0.RT-CYDX0oYdwGKA0sA7i4IHQuoJ38D4qpmLcYf_ggOg';
