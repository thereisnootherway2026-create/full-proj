-- LOCAL DEV ONLY (supabase start). Loaded before local/schema.sql.
-- schema.sql is `supabase db dump --linked --schema public` of production (structure only,
-- no data). The dump doesn't carry extensions; these are the ones the schema needs.
create extension if not exists btree_gist with schema extensions; -- rdv_no_overlap_per_cabinet (gist on uuid =)
create extension if not exists pgcrypto with schema extensions;   -- seed passwords (crypt / gen_salt)
