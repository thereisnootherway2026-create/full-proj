-- Age and sex for prescribing safety.
--
-- patients.date_naissance (date) and patients.sexe (text) already exist and are
-- administrative columns (readable per 20260912070000, writable under
-- patients.update). The repo stores sexe as 'homme' / 'femme' (PatientFormModal,
-- AppointmentFormModal, the ID-card scanner), not 'M' / 'F', so the constraint
-- below uses the repo's values.
--
-- New: date_naissance_approx, set when only an age in years is known (the date
-- is then stored as 1 January of the computed birth year). Administrative, so it
-- joins the column-level SELECT grant.
--
-- Idempotent and non-destructive. The sexe CHECK is added NOT VALID: it applies
-- to new writes only and never rejects rows that already exist.

alter table public.patients
  add column if not exists date_naissance_approx boolean not null default false;

grant select (date_naissance_approx) on public.patients to authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patients_sexe_check') then
    alter table public.patients add constraint patients_sexe_check
      check (sexe is null or sexe in ('homme', 'femme')) not valid;
  end if;
end $$;

-- Pregnancy / breastfeeding is per visit, not per patient: it lives in the
-- consultation record (clinical_encounters.note->>'pregnancyStatus', values
-- 'non' | 'oui' | 'allaitement' | 'inconnu'), validated on completion by
-- mm_complete_encounter (next migration). No column is needed.
