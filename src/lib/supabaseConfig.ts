// Adresse du projet Supabase et clé PUBLIQUE (« publishable » ou « anon »).
// Cette clé est faite pour être visible dans le code de l'appli : c'est le schéma (supabase/schema.sql)
// et ses règles de sécurité par ligne qui protègent les données, pas le secret de la clé.
// Ne jamais mettre ici la clé « service_role » / « secret ».
//
// Valeurs lues dans .env.local (développement) ou .env.production (mise en ligne), voir .env.example.
export const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL || undefined
export const SUPABASE_KEY: string | undefined = import.meta.env.VITE_SUPABASE_KEY || undefined

export const syncConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)
