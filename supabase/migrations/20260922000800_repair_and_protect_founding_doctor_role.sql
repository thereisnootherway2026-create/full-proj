-- Repairs two known corrupted founding-doctor accounts and adds a hard, DB-level
-- invariant so a clinic's founding doctor can never again be stored as anything
-- but a doctor role — closing the exact gap that produced this corruption.
--
-- BACKGROUND
-- ----------
-- public.cabinets.tenant_id and public.clinics.owner_id are set exactly once,
-- at doctor-signup time (handle_new_user()), to the id of the account that
-- created the clinic. That id is, by construction, the clinic's founding
-- doctor — never a secretary (secretaries only ever get a profiles row via
-- mm_finalize_invitation_acceptance(), which never touches cabinets/clinics).
--
-- profiles.role for two such founding accounts was found live as 'secretaire':
--   72698d06-ce57-4a68-a6cd-38b46a3f5cea  ("Dr. thereisno otherway")
--     cabinets.tenant_id = clinics.owner_id = this id, for clinic 02b6620f-...
--   730f495c-f9cf-4850-8f2a-afbf46cd07a0  ("Dr. azrf dsf")
--     cabinets.tenant_id = clinics.owner_id = this id, for clinic f0fd4bc7-...
-- Both accounts were created in August, before 20260913050000 added
-- protect_profile_role_and_clinic — the migration's own comment documents a
-- live-confirmed case of a plain `update profiles set role = ...` self-escalation
-- in that same pre-fix window. That trigger closes direct client writes, but
-- only for current_user <> 'postgres'; nothing before this migration stopped a
-- SECURITY DEFINER path (present-day example: mm_dev_switch_role, added in
-- 20260922000600) from moving a founding doctor's own role to 'secretaire'.
-- A whole-table audit (every clinics.owner_id cross-checked against its
-- profiles.role) found exactly these two rows; no other clinic is affected.

-- ---------------------------------------------------------------------------
-- 1. Repair: only the two verified accounts above, only if still miscategorised.
-- ---------------------------------------------------------------------------
-- Never trusts the hardcoded id list alone — each id must independently verify
-- as an actual cabinets.tenant_id or clinics.owner_id before it is touched, so
-- this can never widen into "fix every secretary". Restricting to role <>
-- 'docteur' makes a second run a no-op (idempotent): nothing left to update,
-- so zero rows affected and no error.
do $$
declare
  v_ids uuid[] := array[
    '72698d06-ce57-4a68-a6cd-38b46a3f5cea',
    '730f495c-f9cf-4850-8f2a-afbf46cd07a0'
  ];
  v_id uuid;
  v_is_owner boolean;
  v_repaired int;
begin
  foreach v_id in array v_ids loop
    select exists(select 1 from public.cabinets k where k.tenant_id = v_id)
        or exists(select 1 from public.clinics c where c.owner_id = v_id)
      into v_is_owner;

    if not v_is_owner then
      raise exception
        'refusing to repair profile %: not verified as a cabinets.tenant_id or clinics.owner_id',
        v_id;
    end if;
  end loop;

  update public.profiles
     set role = 'docteur',
         updated_at = now()
   where id = any(v_ids)
     and role is distinct from 'docteur';

  get diagnostics v_repaired = row_count;
  raise notice 'repaired % founding-doctor profile(s)', v_repaired;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Invariant: profiles.id = cabinets.tenant_id / clinics.owner_id => role is
--    a doctor role. Unlike protect_profile_role_and_clinic, this has NO
--    current_user = 'postgres' bypass — it is a hard business rule, not a
--    client-write guard, so it also catches SECURITY DEFINER paths such as
--    mm_dev_switch_role and any future admin/migration script.
--
--    The check is global on profiles.id (not scoped to the row's own
--    cabinet_id/clinic_id): once an id is a clinic's founding owner, it can
--    never carry a non-doctor role, in any clinic, ever — matching "the
--    founding doctor's role must NEVER be changed to secretaire" literally.
--
--    Accepts every doctor-role spelling already live in this table (docteur /
--    doctor / medecin / médecin, case-insensitively) — the same set getDoctors()
--    and the dashboard's isDoctor already treat as "is a doctor" — so this
--    never blocks a legitimate existing owner whose role isn't literally the
--    string 'docteur'.
--
--    Ordinary secretary invitations are unaffected: an invitee's id is never a
--    cabinets.tenant_id/clinics.owner_id (only handle_new_user's doctor-signup
--    branch ever creates those rows), so the condition is simply false and
--    role = 'secretaire' passes through untouched.
create or replace function public.enforce_founding_doctor_role()
returns trigger
language plpgsql
as $$
declare
  v_is_founder boolean;
begin
  select exists(select 1 from public.cabinets k where k.tenant_id = new.id)
      or exists(select 1 from public.clinics c where c.owner_id = new.id)
    into v_is_founder;

  if v_is_founder and lower(coalesce(new.role, '')) <> all(array['docteur', 'doctor', 'medecin', 'médecin']) then
    raise exception
      'profile % is a clinic''s founding doctor (cabinets.tenant_id / clinics.owner_id) and cannot be set to role %',
      new.id, new.role;
  end if;

  return new;
end;
$$;

-- Name chosen to sort (and therefore fire) after protect_profile_role_and_clinic
-- in Postgres's alphabetical same-table/same-timing trigger order, so this sees
-- the final NEW.role for the statement, not an intermediate value.
drop trigger if exists zz_enforce_founding_doctor_role on public.profiles;
create trigger zz_enforce_founding_doctor_role
before insert or update on public.profiles
for each row execute function public.enforce_founding_doctor_role();
