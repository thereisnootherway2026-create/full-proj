-- FINAL CLOSURE PASS — CRITICAL finding, Section 12 (role escalation).
--
-- profiles RLS only ever checked `auth.uid() = id` for UPDATE, with no
-- column restriction and no protective trigger on role/clinic_id/cabinet_id
-- (ensure_profile_clinic_id only back-fills clinic_id from cabinet_id when
-- null — it does not block a direct write to either). Confirmed live: a
-- secretary test account successfully changed her OWN role to 'admin' via
-- a plain `update profiles set role = 'admin' where id = auth.uid()` —
-- immediate, complete privilege escalation (is_admin() would then return
-- true for her everywhere in the system). Reverted the test account
-- immediately after confirming the bug.
--
-- No frontend code anywhere currently inserts or updates `profiles`
-- directly (grepped: zero matches for both) — profile creation is
-- exclusively handled by handle_new_user() (SECURITY DEFINER, owned by
-- postgres) and role/clinic assignment exclusively by
-- mm_finalize_invitation_acceptance (also SECURITY DEFINER). So this fix
-- has zero legitimate current use case to preserve — matches the same
-- current_user = 'postgres' bypass already used by
-- protect_onboarding_completed_at and protect_patient_clinical_fields for
-- exactly this reason: SECURITY DEFINER functions execute as their owner,
-- so this still lets the real onboarding/invitation flow work unchanged
-- while closing direct client access entirely.

create or replace function public.protect_profile_role_and_clinic()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'postgres' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := null;
    new.clinic_id := null;
    new.cabinet_id := null;
    return new;
  end if;

  new.role := old.role;
  new.clinic_id := old.clinic_id;
  new.cabinet_id := old.cabinet_id;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_and_clinic on public.profiles;
create trigger protect_profile_role_and_clinic
before insert or update on public.profiles
for each row execute function public.protect_profile_role_and_clinic();
