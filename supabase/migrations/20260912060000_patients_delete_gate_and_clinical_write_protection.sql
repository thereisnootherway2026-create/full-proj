-- PRODUCTION HARDENING AUDIT
--
-- 1. patients had no DELETE restriction at all (three overlapping tenant-only
--    PERMISSIVE ALL policies). src/lib/api.ts exports deletePatient() which,
--    while not currently wired to any UI button, is directly callable via
--    the client SDK — any clinic member could delete any patient row. No
--    "patients.delete" capability exists anywhere in the product's spec, so
--    this is hard-restricted to doctor/admin rather than made permission-
--    configurable, same treatment as the clinical tables in 20260912010000.
--
-- 2. antecedents/allergies/groupe_sanguin (clinical-adjacent fields on an
--    otherwise-administrative table) were writable by anyone holding
--    patients.update — a secretary with that default permission could set
--    these via the same shared PatientFormModal used for administrative
--    edits, since RLS can gate rows but not individual columns. A BEFORE
--    INSERT/UPDATE trigger closes this: for any caller who isn't
--    doctor/admin (and isn't a SECURITY DEFINER function running as the
--    table owner — same current_user <> 'postgres' distinction already used
--    by protect_onboarding_completed_at), these three columns are forced to
--    NULL on insert and pinned to their previous value on update. This is
--    silent-revert, not a raised exception, so the shared form's normal
--    submit (which always includes these fields, unchanged, for a secretary
--    who can't see them once the UI is updated) keeps working.

drop policy if exists patients_delete_permission_gate on public.patients;
create policy patients_delete_permission_gate on public.patients as restrictive for delete to authenticated using (
  public.is_admin() or public.current_role() = 'doctor'
);

create or replace function public.protect_patient_clinical_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'postgres' or public.is_admin() or public.current_role() = 'doctor' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.antecedents := null;
    new.allergies := null;
    new.groupe_sanguin := null;
    return new;
  end if;

  new.antecedents := old.antecedents;
  new.allergies := old.allergies;
  new.groupe_sanguin := old.groupe_sanguin;
  return new;
end;
$$;

drop trigger if exists protect_patient_clinical_fields on public.patients;
create trigger protect_patient_clinical_fields
before insert or update on public.patients
for each row execute function public.protect_patient_clinical_fields();
