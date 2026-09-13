-- FINAL PRODUCTION HARDENING PASS — Phase 1 audit finding.
--
-- create_walk_in_visit and reassign_visit_doctor both used
-- mm_assert_role(array['secretary']) — a raw ROLE check that completely
-- ignores the permission override system. Confirmed live: create_walk_in_visit
-- is wired to the "+ Arrivée sans RDV" button (DashboardPage.jsx, gated only
-- by the OLD/stale rbac.js can(userRole, 'visits:queue') hardcoded list, not
-- the new permission system either). A doctor revoking waiting_room.add_patient
-- from a secretary would have had zero effect on her ability to register a
-- walk-in and put them straight in the queue — exactly the
-- "revoked permissions continue to work" bypass this audit was told to find.
--
-- reassign_visit_doctor has the same role-only pattern but is currently dead
-- code (exported by visitService.js, not called from any UI) — fixed anyway
-- since it's directly callable via the client SDK regardless of whether the
-- UI uses it, and it's the same bug shape. Mapped to waiting_room.change_status,
-- which existed in the permission catalogue but had zero real enforcement
-- behind it until now.
--
-- is_admin() is added to both (previously excluded doctor AND admin outright)
-- for consistency with every other RPC in this system — never a regression,
-- since role_permissions.doctor already grants both keys by default
-- (20260912100000) and is_admin() already always returns true elsewhere.

create or replace function public.create_walk_in_visit(p_patient_id uuid, p_doctor_id uuid)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  patient_clinic uuid;
  doctor_clinic uuid;
  qn integer;
  visit_row public.visits%rowtype;
begin
  if not (public.is_admin() or public.mm_has_permission('waiting_room.add_patient')) then
    raise exception 'not authorized';
  end if;

  select cabinet_id into patient_clinic from public.patients where id = p_patient_id;
  if patient_clinic is null then
    raise exception 'patient not found';
  end if;
  perform public.mm_assert_same_clinic(patient_clinic);

  select coalesce(clinic_id, cabinet_id) into doctor_clinic
  from public.profiles
  where id = p_doctor_id
    and public.mm_role_key(role) = 'doctor'
    and status = 'active';

  if doctor_clinic is distinct from patient_clinic then
    raise exception 'doctor must belong to the same clinic';
  end if;

  qn := public.mm_next_queue_number(patient_clinic, p_doctor_id, current_date);

  insert into public.visits (
    clinic_id, patient_id, source, doctor_id, status,
    queue_date, queue_number, queue_sort_at, queued_at, arrived_at, waiting_at,
    created_by, updated_by
  )
  values (
    patient_clinic, p_patient_id, 'walk_in', p_doctor_id, 'waiting',
    current_date, qn, now(), now(), now(), now(), auth.uid(), auth.uid()
  )
  returning * into visit_row;

  perform public.write_audit_log('VISIT_CREATED_WALK_IN', 'visit', visit_row.id, null, to_jsonb(visit_row), null);
  perform public.write_audit_log('PATIENT_WAITING', 'visit', visit_row.id, null, to_jsonb(visit_row), null);

  return visit_row;
end;
$$;

create or replace function public.reassign_visit_doctor(p_visit_id uuid, p_doctor_id uuid)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  doctor_clinic uuid;
  next_status text;
  qn integer;
begin
  if not (public.is_admin() or public.mm_has_permission('waiting_room.change_status')) then
    raise exception 'not authorized';
  end if;

  select * into visit_before from public.visits where id = p_visit_id;
  if not found then
    raise exception 'visit not found';
  end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status not in ('scheduled', 'arrived', 'waiting', 'called') then
    raise exception 'visit cannot be reassigned after consultation starts';
  end if;

  select coalesce(clinic_id, cabinet_id) into doctor_clinic
  from public.profiles
  where id = p_doctor_id
    and public.mm_role_key(role) = 'doctor'
    and status = 'active';

  if doctor_clinic is distinct from visit_before.clinic_id then
    raise exception 'doctor must belong to the same clinic';
  end if;

  next_status := case when visit_before.status = 'called' then 'waiting' else visit_before.status end;
  qn := public.mm_next_queue_number(visit_before.clinic_id, p_doctor_id, current_date);

  update public.visits
  set doctor_id = p_doctor_id,
      status = next_status,
      queue_date = current_date,
      queue_number = qn,
      queue_sort_at = now(),
      queued_at = coalesce(queued_at, now()),
      waiting_at = case when next_status = 'waiting' then coalesce(waiting_at, now()) else waiting_at end,
      called_at = case when visit_before.status = 'called' then null else called_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  perform public.write_audit_log('VISIT_DOCTOR_REASSIGNED', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null);

  return visit_after;
end;
$$;
