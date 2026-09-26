-- Bug: a secretary saw "Aucun médecin disponible" in every doctor picker (the walk-in "Arrivée
-- sans RDV" panel, appointment forms, filters) even on a clinic with an active, correctly-scoped
-- doctor. getDoctors() (src/lib/visitService.js) queries profiles by cabinet_id + role, which is
-- correct, but public.profiles had no SELECT policy letting a secretary read a colleague's row:
-- every policy was either "own row only" (auth.uid() = id) or the one-directional
-- "Docteur can read secretary profile" (doctor -> secretary). RLS silently returned zero rows.
-- Reproduced live: clinic 5c2bd5b4-eb3e-45d6-93d6-e2d7cf91b868 has an active docteur profile;
-- its secretary's own getDoctors() query returned none.
--
-- Fix: any authenticated member can read the administrative profile (name, role, email, telephone,
-- status — profiles holds no clinical data) of another member of their own clinic, both directions.
-- This subsumes "Docteur can read secretary profile", which is left in place since it is harmless.

create policy profiles_read_same_clinic on public.profiles
  for select to authenticated
  using (clinic_id = public.current_clinic_id());
