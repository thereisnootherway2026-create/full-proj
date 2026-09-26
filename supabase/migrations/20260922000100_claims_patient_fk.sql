-- insurance_claims.patient_id had no foreign key, so PostgREST could not embed the patient
-- (select "*, patients:patient_id(...)"), and the Tiers payant tab failed to load.
alter table public.insurance_claims
  drop constraint if exists insurance_claims_patient_id_fkey;
alter table public.insurance_claims
  add constraint insurance_claims_patient_id_fkey
  foreign key (patient_id) references public.patients(id) on delete cascade;

notify pgrst, 'reload schema';
