-- LOCAL DEV ONLY — test data for `supabase start` / `supabase db reset`. Never run against production.
-- Loaded after supabase/local/schema.sql (production structure) and local/10_auth_storage.sql.
--
-- Test doctor login (local instance only):
--   email:    medecin.test@macromedica.local
--   password: LocalTest-Renouvellement-2026
--
-- The doctor is created the way a real signup is: an auth.users row whose metadata carries
-- nom_cabinet, so the real trigger (on_auth_user_created -> handle_new_user) creates the
-- cabinet, the clinics row and the profile. The patient and the issued ordonnance are then
-- inserted in that cabinet.

-- Fixed ids so tests and SQL checks can refer to them.
--   doctor   11111111-1111-4111-8111-111111111111
--   patient  22222222-2222-4222-8222-222222222222
--   ordonnance (issued) 33333333-3333-4333-8333-333333333333

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated',
  'medecin.test@macromedica.local',
  extensions.crypt('LocalTest-Renouvellement-2026', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object(
    'role', 'docteur',
    'nom_complet', 'Dr. Test Local',
    'nom_cabinet', 'Cabinet Test Local',
    'specialite', 'Médecine Générale',
    'ville', 'Rabat',
    'telephone', '0600000000'
  ),
  now(), now(), '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_object('sub', '11111111-1111-4111-8111-111111111111', 'email', 'medecin.test@macromedica.local', 'email_verified', true),
  'email', now(), now(), now()
);

-- Profile details the signup form would add (specialty, address for the letterhead).
update public.profiles set specialite = 'Médecine Générale' where id = '11111111-1111-4111-8111-111111111111';
update public.cabinets set adresse = '12 avenue de Test, Rabat'
where id = (select cabinet_id from public.profiles where id = '11111111-1111-4111-8111-111111111111');

-- Test patient: a man with a known date of birth, so prescribing (age + sexe) is ready.
insert into public.patients (id, cabinet_id, nom, prenom, telephone, date_naissance, sexe, allergies, allergies_status)
select '22222222-2222-4222-8222-222222222222', p.cabinet_id, 'Renouvellement', 'Patient', '0611111111', '1970-03-15', 'homme', 'Aucune', 'none'
from public.profiles p where p.id = '11111111-1111-4111-8111-111111111111';

-- The previous ordonnance: issued a month ago, two lines — what "Reconduire à l'identique" must copy.
insert into public.ordonnances (id, cabinet_id, patient_id, doctor_id, created_by, statut, date_prescription, entete, emitted_at, emitted_by, created_at)
select '33333333-3333-4333-8333-333333333333', p.cabinet_id, '22222222-2222-4222-8222-222222222222',
       p.id, p.id, 'emise', current_date - 30,
       jsonb_build_object('nomMedecin', 'Dr. Test Local', 'specialite', 'Médecine Générale', 'ville', 'Rabat', 'signe', true),
       now() - interval '30 days', p.id, now() - interval '30 days'
from public.profiles p where p.id = '11111111-1111-4111-8111-111111111111';

insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree) values
  ('33333333-3333-4333-8333-333333333333', 0, 'Amlodipine 5 mg', '1 cp le matin', '3 mois'),
  ('33333333-3333-4333-8333-333333333333', 1, 'Metformine 850 mg', '1 cp matin et soir', '3 mois');
