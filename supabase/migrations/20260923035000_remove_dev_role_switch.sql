-- SECURITY: remove the dev role switcher and demote the two secretaries it (and
-- its migration) promoted to doctor.
--
-- FINDINGS (read-only live checks, 2026-09-23)
-- -------------------------------------------
-- 1. public.mm_dev_switch_role(text) (20260922000600) is granted to every
--    authenticated user and is SECURITY DEFINER. Any logged-in account — a
--    secretary included — can set its OWN profiles.role to 'docteur' or even
--    'admin'. protect_profile_role_and_clinic does not stop it (that trigger
--    guards client writes, and this path runs as the function owner); only the
--    founding-doctor invariant (20260922000800) limits it, and only in the
--    doctor -> non-doctor direction. The frontend only calls it from dev builds
--    (import.meta.env.DEV), but that is a client-side check: the RPC itself is
--    reachable from any session through the API. An "environment" check inside
--    the database cannot fix this either: local development and production use
--    the same Supabase database, so there is no setting that is true in one and
--    false in the other. The function is dropped.
--
--    audit_logs shows it was used live 82 times (ROLE_SWITCHED_DEV), including
--    by secretary 432ee79a promoting itself secretaire -> docteur on
--    2026-09-22 12:38.
--
-- 2. 20260922000600 also hard-coded `update profiles set role = 'docteur'` for
--    two ids that are each their clinic's secretary (clinics.secretary_id,
--    accepted secretary invitation, never a visit's doctor):
--      95519749-fc09-463c-a79a-77a1cdd1dc89  (secretary of clinic 93663f32-…)
--      432ee79a-1245-4470-be20-e6c3fe8f9f3e  (secretary of clinic 5c2bd5b4-…)
--    Both still hold 'docteur', i.e. doctor-level database privileges
--    (mm_assert_role(['doctor']) accepts it), in clinics with real history.
--
-- Not changed here, flagged for a decision: profile 4c79d39b-… (role 'doctor',
-- clinic 4aeccc01-…) is neither owner nor secretary, has no invitation, and its
-- profile row was inserted with identical created/updated/onboarded timestamps —
-- no product flow creates that. It is not a secretary, so there is no verified
-- correct role to restore it to.

-- ---------------------------------------------------------------------------
-- 1. Remove the switcher.
-- ---------------------------------------------------------------------------
revoke all on function public.mm_dev_switch_role(text) from public, anon, authenticated;
drop function if exists public.mm_dev_switch_role(text);

-- ---------------------------------------------------------------------------
-- 2. Repair: only the two ids above, only if each still verifies as its
--    clinic's secretary and not as any clinic's founder. Idempotent: a second
--    run finds nothing to change.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ids uuid[] := array[
    '95519749-fc09-463c-a79a-77a1cdd1dc89',
    '432ee79a-1245-4470-be20-e6c3fe8f9f3e'
  ];
  v_id uuid;
  v_before text;
  v_clinic uuid;
begin
  foreach v_id in array v_ids loop
    select c.id into v_clinic from public.clinics c where c.secretary_id = v_id;
    if v_clinic is null then
      raise exception 'refusing to demote profile %: not verified as a clinics.secretary_id', v_id;
    end if;
    if exists (select 1 from public.cabinets k where k.tenant_id = v_id)
       or exists (select 1 from public.clinics c where c.owner_id = v_id) then
      raise exception 'refusing to demote profile %: it is a clinic founder', v_id;
    end if;

    select role into v_before from public.profiles where id = v_id;
    if lower(coalesce(v_before, '')) not in ('secretaire', 'secretary') then
      update public.profiles set role = 'secretaire', updated_at = now() where id = v_id;
      insert into public.audit_logs (clinic_id, actor_id, actor_role, action, entity_type, entity_id, before, after, metadata)
      values (
        v_clinic, null, 'system', 'ROLE_REPAIRED', 'profile', v_id,
        jsonb_build_object('role', v_before), jsonb_build_object('role', 'secretaire'),
        jsonb_build_object('migration', '20260923035000_remove_dev_role_switch', 'reason', 'secretary promoted to doctor by mm_dev_switch_role / 20260922000600')
      );
      raise notice 'profile % demoted from % to secretaire', v_id, v_before;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Invariant (mirror of zz_enforce_founding_doctor_role): a clinic's
--    secretary (clinics.secretary_id) can only hold a secretary role. No
--    postgres bypass — it also stops SECURITY DEFINER paths and scripts, which
--    is exactly how this happened. Promoting a secretary to doctor on purpose
--    requires clearing clinics.secretary_id first, a deliberate two-step change.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_clinic_secretary_role()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.clinics c where c.secretary_id = new.id)
     and lower(coalesce(new.role, '')) <> all(array['secretaire', 'secretary']) then
    raise exception
      'profile % is a clinic''s secretary (clinics.secretary_id) and cannot be set to role %',
      new.id, new.role;
  end if;
  return new;
end;
$$;

-- zz_ prefix: fires after protect_profile_role_and_clinic, alongside
-- zz_enforce_founding_doctor_role, so it sees the final NEW.role.
drop trigger if exists zz_enforce_clinic_secretary_role on public.profiles;
create trigger zz_enforce_clinic_secretary_role
before insert or update on public.profiles
for each row execute function public.enforce_clinic_secretary_role();

notify pgrst, 'reload schema';
