-- The doctor's specialty was only kept in the signup metadata (auth.users), so every
-- ordonnance asked for it again and mm ordonnance-from-encounter always fell back to
-- 'Médecin généraliste'. It now lives on the profile, is edited in Paramètres → Profil &
-- Cabinet, and feeds every printed letterhead.
alter table public.profiles add column if not exists specialite text;

alter table public.profiles drop constraint if exists profiles_specialite_length;
alter table public.profiles add constraint profiles_specialite_length
  check (specialite is null or char_length(specialite) <= 120);

-- Backfill from what each doctor chose at signup.
update public.profiles p
set specialite = nullif(btrim(u.raw_user_meta_data ->> 'specialite'), '')
from auth.users u
where u.id = p.id
  and p.specialite is null
  and nullif(btrim(u.raw_user_meta_data ->> 'specialite'), '') is not null;
