-- Three-state clinical status for allergies / antécédents / traitements.
--
-- Problem: an empty `allergies` column was rendered as "Aucune allergie", i.e.
-- "we never asked" was displayed as "the patient has none". This adds an explicit
-- status per list: 'unknown' (never verified), 'none' (verified: nothing known),
-- 'listed' (verified: see the list), plus who verified it and when.
--
-- Security model (unchanged, extended):
--   * The new columns are clinical: they are NOT added to the column-level SELECT
--     grant from 20260912070000, so `authenticated` cannot read them directly.
--     Doctor/admin read them through mm_get_patient_clinical() (extended below).
--   * Writes go through mm_set_patient_clinical() (doctor/admin, same clinic,
--     audited). protect_patient_clinical_fields() now also pins the status and
--     verification columns for every direct write, so they can only change via
--     SECURITY DEFINER code (current_user = 'postgres'), or be derived when a
--     doctor edits the free text through the existing patient form.
--
-- Idempotent and non-destructive: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
-- backfill only touches rows still at 'unknown'. No row or column is removed.

alter table public.patients
  add column if not exists allergies_status text not null default 'unknown',
  add column if not exists antecedents_status text not null default 'unknown',
  add column if not exists medications_status text not null default 'unknown',
  add column if not exists clinical_verified_at timestamptz,
  add column if not exists clinical_verified_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patients_allergies_status_check') then
    alter table public.patients add constraint patients_allergies_status_check
      check (allergies_status in ('unknown', 'none', 'listed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_antecedents_status_check') then
    alter table public.patients add constraint patients_antecedents_status_check
      check (antecedents_status in ('unknown', 'none', 'listed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_medications_status_check') then
    alter table public.patients add constraint patients_medications_status_check
      check (medications_status in ('unknown', 'none', 'listed'));
  end if;
end $$;

-- True when a free-text clinical field holds real content. Legacy "none" markers
-- typed into the text ("aucune", "néant", "RAS", "-") are NOT real content: those
-- rows stay 'unknown' (never 'none') so a doctor re-verifies them once.
create or replace function public.mm__clinical_text_listed(p text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select btrim(coalesce(p, '')) <> ''
     and lower(btrim(p)) not in ('aucune', 'aucun', 'aucunes', 'aucuns', 'néant', 'neant', 'rien', 'ras', 'r.a.s', 'r.a.s.', 'non', '-', '--', '/', '0', 'nr', 'n/a')
$$;
-- Pure text check, no data access. `authenticated` keeps EXECUTE because the
-- (non SECURITY DEFINER) trigger below calls it as the signed-in user.
revoke all on function public.mm__clinical_text_listed(text) from public, anon;
grant execute on function public.mm__clinical_text_listed(text) to authenticated;

-- Backfill. RULE: 'listed' only where real data exists; everything else stays
-- 'unknown'. NEVER backfill 'none'. Only rows still at 'unknown' are touched, so
-- re-running this migration never overrides a doctor's later verification.
-- (Runs as the migration owner, so protect_patient_clinical_fields lets it through.)
update public.patients
   set allergies_status = 'listed'
 where allergies_status = 'unknown'
   and public.mm__clinical_text_listed(allergies);

update public.patients
   set antecedents_status = 'listed'
 where antecedents_status = 'unknown'
   and public.mm__clinical_text_listed(antecedents);

update public.patients p
   set medications_status = 'listed'
 where p.medications_status = 'unknown'
   and exists (
     select 1 from public.patient_medications m
      where m.patient_id = p.id
        and m.cabinet_id = p.cabinet_id
        and coalesce(m.status, 'Actif') <> 'Arrêté'
   );

-- Write protection, extended to the new columns.
--   * postgres (migrations, SECURITY DEFINER RPCs): unrestricted, as before.
--   * doctor/admin direct writes (existing PatientFormModal): may edit the text;
--     the matching status is DERIVED from the text (content -> 'listed',
--     emptied -> 'unknown'), never set freely. Statuses and verification columns
--     are otherwise pinned.
--   * everyone else: clinical text AND statuses forced to NULL/'unknown' on
--     insert, pinned to their previous value on update (silent revert, as before).
create or replace function public.protect_patient_clinical_fields()
returns trigger
language plpgsql
as $$
declare
  v_clinician boolean;
begin
  if current_user = 'postgres' then
    return new;
  end if;

  v_clinician := public.is_admin() or public.current_role() = 'doctor';

  if tg_op = 'INSERT' then
    if not v_clinician then
      new.antecedents := null;
      new.allergies := null;
      new.groupe_sanguin := null;
    end if;
    new.allergies_status := case when v_clinician and public.mm__clinical_text_listed(new.allergies) then 'listed' else 'unknown' end;
    new.antecedents_status := case when v_clinician and public.mm__clinical_text_listed(new.antecedents) then 'listed' else 'unknown' end;
    new.medications_status := 'unknown';
    new.clinical_verified_at := null;
    new.clinical_verified_by := null;
    return new;
  end if;

  -- UPDATE
  if not v_clinician then
    new.antecedents := old.antecedents;
    new.allergies := old.allergies;
    new.groupe_sanguin := old.groupe_sanguin;
  end if;

  new.allergies_status := old.allergies_status;
  new.antecedents_status := old.antecedents_status;
  new.medications_status := old.medications_status;
  new.clinical_verified_at := old.clinical_verified_at;
  new.clinical_verified_by := old.clinical_verified_by;

  if v_clinician then
    if new.allergies is distinct from old.allergies then
      new.allergies_status := case when public.mm__clinical_text_listed(new.allergies) then 'listed' else 'unknown' end;
      new.clinical_verified_at := now();
      new.clinical_verified_by := auth.uid();
    end if;
    if new.antecedents is distinct from old.antecedents then
      new.antecedents_status := case when public.mm__clinical_text_listed(new.antecedents) then 'listed' else 'unknown' end;
      new.clinical_verified_at := now();
      new.clinical_verified_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_patient_clinical_fields on public.patients;
create trigger protect_patient_clinical_fields
before insert or update on public.patients
for each row execute function public.protect_patient_clinical_fields();

-- Read: same gate as before (doctor/admin, same clinic), now also returning the
-- statuses. The return type changes, which CREATE OR REPLACE cannot do, so the
-- function is dropped and recreated in this same transaction.
drop function if exists public.mm_get_patient_clinical(uuid);

create function public.mm_get_patient_clinical(p_patient_id uuid)
returns table (
  antecedents text,
  allergies text,
  groupe_sanguin text,
  allergies_status text,
  antecedents_status text,
  medications_status text,
  clinical_verified_at timestamptz,
  clinical_verified_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    raise exception 'not authorized';
  end if;

  select p.cabinet_id into v_clinic from public.patients p where p.id = p_patient_id;
  if v_clinic is null then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_clinic);

  return query
  select p.antecedents, p.allergies, p.groupe_sanguin,
         p.allergies_status, p.antecedents_status, p.medications_status,
         p.clinical_verified_at, p.clinical_verified_by
  from public.patients p
  where p.id = p_patient_id
    and p.cabinet_id = public.current_clinic_id();
end;
$$;

revoke all on function public.mm_get_patient_clinical(uuid) from public, anon;
grant execute on function public.mm_get_patient_clinical(uuid) to authenticated;

-- Write: doctor/admin only, same clinic, audited.
-- A NULL status argument leaves that list untouched, so the sidebar can save one
-- list at a time. Semantics per list:
--   'listed'  -> text required (non-empty, real content), stored as given
--   'none'    -> verified "nothing known": the text is cleared
--   'unknown' -> "à vérifier plus tard": the text is kept as-is
-- Every call that changes a status stamps clinical_verified_at / _by.
create or replace function public.mm_set_patient_clinical(
  p_patient_id uuid,
  p_allergies_status text default null,
  p_allergies text default null,
  p_antecedents_status text default null,
  p_antecedents text default null,
  p_medications_status text default null
)
returns table (
  antecedents text,
  allergies text,
  groupe_sanguin text,
  allergies_status text,
  antecedents_status text,
  medications_status text,
  clinical_verified_at timestamptz,
  clinical_verified_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.patients%rowtype;
  v_after public.patients%rowtype;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    raise exception 'not authorized';
  end if;

  if p_allergies_status is not null and p_allergies_status not in ('unknown', 'none', 'listed') then
    raise exception 'invalid status';
  end if;
  if p_antecedents_status is not null and p_antecedents_status not in ('unknown', 'none', 'listed') then
    raise exception 'invalid status';
  end if;
  if p_medications_status is not null and p_medications_status not in ('unknown', 'none', 'listed') then
    raise exception 'invalid status';
  end if;
  if p_allergies_status = 'listed' and not public.mm__clinical_text_listed(p_allergies) then
    raise exception 'empty list';
  end if;
  if p_antecedents_status = 'listed' and not public.mm__clinical_text_listed(p_antecedents) then
    raise exception 'empty list';
  end if;
  if length(coalesce(p_allergies, '')) > 4000 or length(coalesce(p_antecedents, '')) > 8000 then
    raise exception 'text too long';
  end if;

  select * into v_before from public.patients where id = p_patient_id for update;
  if not found then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_before.cabinet_id);
  if v_before.cabinet_id is distinct from public.current_clinic_id() then
    raise exception 'not authorized';
  end if;

  update public.patients p
     set allergies = case
           when p_allergies_status = 'listed' then btrim(p_allergies)
           when p_allergies_status = 'none' then null
           else p.allergies end,
         allergies_status = coalesce(p_allergies_status, p.allergies_status),
         antecedents = case
           when p_antecedents_status = 'listed' then btrim(p_antecedents)
           when p_antecedents_status = 'none' then null
           else p.antecedents end,
         antecedents_status = coalesce(p_antecedents_status, p.antecedents_status),
         medications_status = coalesce(p_medications_status, p.medications_status),
         clinical_verified_at = case
           when coalesce(p_allergies_status, p_antecedents_status, p_medications_status) is not null then now()
           else p.clinical_verified_at end,
         clinical_verified_by = case
           when coalesce(p_allergies_status, p_antecedents_status, p_medications_status) is not null then auth.uid()
           else p.clinical_verified_by end
   where p.id = p_patient_id
  returning * into v_after;

  -- Audit without copying the clinical text itself into the log.
  perform public.write_audit_log(
    'PATIENT_CLINICAL_UPDATED', 'patient', p_patient_id,
    jsonb_build_object(
      'allergies_status', v_before.allergies_status,
      'antecedents_status', v_before.antecedents_status,
      'medications_status', v_before.medications_status
    ),
    jsonb_build_object(
      'allergies_status', v_after.allergies_status,
      'antecedents_status', v_after.antecedents_status,
      'medications_status', v_after.medications_status
    ),
    jsonb_build_object(
      'allergies_changed', v_after.allergies is distinct from v_before.allergies,
      'antecedents_changed', v_after.antecedents is distinct from v_before.antecedents
    )
  );

  return query
  select v_after.antecedents, v_after.allergies, v_after.groupe_sanguin,
         v_after.allergies_status, v_after.antecedents_status, v_after.medications_status,
         v_after.clinical_verified_at, v_after.clinical_verified_by;
end;
$$;

revoke all on function public.mm_set_patient_clinical(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.mm_set_patient_clinical(uuid, text, text, text, text, text) to authenticated;
