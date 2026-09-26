-- Drop any previous signatures to avoid function overloading conflicts
drop function if exists public.add_to_waiting_room(uuid);
drop function if exists public.add_to_waiting_room(uuid, uuid);

-- -------------------------------------------------------------
-- FIX BUG 1: cancel_visit
-- -------------------------------------------------------------
create or replace function public.cancel_visit(
  p_visit_id uuid,
  p_reason text default null::text
)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
begin
  perform public.mm_assert_permission('waiting_room.remove_patient');

  select * into visit_before
  from public.visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'visit not found';
  end if;

  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status = 'cancelled' then
    raise exception 'visit is already cancelled';
  end if;

  if visit_before.status not in ('scheduled', 'arrived', 'waiting', 'called') then
    raise exception 'cancellation is only allowed before consultation';
  end if;

  update public.visits
  set status = 'cancelled',
      cancelled_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  if visit_after.rdv_id is not null then
    update public.rdv
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by = coalesce(cancelled_by, auth.uid()),
        cancellation_reason = coalesce(p_reason, cancellation_reason)
    where id = visit_after.rdv_id;

    perform public.write_audit_log(
      'APPOINTMENT_CANCELLED',
      'rdv',
      visit_after.rdv_id,
      null,
      null,
      jsonb_build_object('reason', p_reason, 'via', 'cancel_visit', 'visit_id', p_visit_id)
    );
  end if;

  perform public.write_audit_log(
    'PATIENT_CANCELLED',
    'visit',
    p_visit_id,
    to_jsonb(visit_before),
    to_jsonb(visit_after),
    jsonb_build_object('reason', p_reason)
  );

  return visit_after;
end;
$$;

revoke execute on function public.cancel_visit(uuid, text) from public;
grant execute on function public.cancel_visit(uuid, text) to authenticated;

-- -------------------------------------------------------------
-- FIX BUG 2: create_visit_from_rdv & add_to_waiting_room
-- -------------------------------------------------------------
create or replace function public.create_visit_from_rdv(
  p_rdv_id uuid,
  p_doctor_id uuid default null
)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_row public.rdv%rowtype;
  doctor_clinic uuid;
  resolved_doctor_id uuid := p_doctor_id;
  visit_row public.visits%rowtype;
  qn integer;
begin
  perform public.mm_assert_permission('waiting_room.add_patient');

  select * into rdv_row
  from public.rdv
  where id = p_rdv_id
  for update;

  if not found then
    raise exception 'appointment not found';
  end if;

  perform public.mm_assert_same_clinic(rdv_row.cabinet_id);

  -- Explicit appointment status validation (BUG 2 FIX)
  -- Only scheduled / confirme appointments are allowed into the waiting room.
  if lower(coalesce(rdv_row.status, '')) = 'cancelled' then
    raise exception 'cannot add cancelled appointment to waiting room';
  elsif lower(coalesce(rdv_row.status, '')) not in ('scheduled', 'confirme') then
    raise exception 'cannot add % appointment to waiting room', rdv_row.status;
  end if;

  -- Resolve doctor if not explicitly supplied
  if resolved_doctor_id is null then
    select id into resolved_doctor_id
    from public.profiles
    where coalesce(clinic_id, cabinet_id) = rdv_row.cabinet_id
      and public.mm_role_key(role) = 'doctor'
      and status = 'active'
    order by created_at asc
    limit 1;

    if resolved_doctor_id is null then
      raise exception 'no active doctor found for this clinic';
    end if;
  else
    select coalesce(clinic_id, cabinet_id) into doctor_clinic
    from public.profiles
    where id = resolved_doctor_id
      and public.mm_role_key(role) = 'doctor'
      and status = 'active';

    if doctor_clinic is distinct from rdv_row.cabinet_id then
      raise exception 'doctor must belong to the same clinic';
    end if;
  end if;

  -- Check for existing active/waiting visit
  select * into visit_row
  from public.visits
  where rdv_id = p_rdv_id
    and status <> 'cancelled'
  order by created_at desc
  limit 1
  for update;

  if found then
    if visit_row.status in ('consultation', 'billing', 'completed') then
      raise exception 'visit already advanced';
    end if;

    if visit_row.doctor_id is distinct from resolved_doctor_id then
      qn := public.mm_next_queue_number(rdv_row.cabinet_id, resolved_doctor_id, current_date);
    else
      qn := visit_row.queue_number;
    end if;

    update public.visits
    set doctor_id = resolved_doctor_id,
        queue_number = qn,
        status = 'waiting',
        waiting_at = coalesce(waiting_at, now()),
        updated_by = auth.uid(),
        updated_at = now()
    where id = visit_row.id
    returning * into visit_row;
  else
    qn := public.mm_next_queue_number(rdv_row.cabinet_id, resolved_doctor_id, current_date);

    insert into public.visits (
      clinic_id,
      patient_id,
      rdv_id,
      source,
      doctor_id,
      status,
      queue_date,
      queue_number,
      queue_sort_at,
      queued_at,
      waiting_at,
      created_by,
      updated_by
    ) values (
      rdv_row.cabinet_id,
      rdv_row.patient_id,
      rdv_row.id,
      'appointment',
      resolved_doctor_id,
      'waiting',
      current_date,
      qn,
      now(),
      now(),
      now(),
      auth.uid(),
      auth.uid()
    )
    returning * into visit_row;
  end if;

  -- Synchronize rdv arrival_status
  update public.rdv
  set arrival_status = 'WAITING',
      arrived_at = coalesce(arrived_at, now())
  where id = p_rdv_id;

  perform public.write_audit_log(
    'VISIT_CREATED_FROM_RDV',
    'visit',
    visit_row.id,
    null,
    to_jsonb(visit_row),
    jsonb_build_object('rdv_id', p_rdv_id, 'queue_number', qn, 'doctor_id', resolved_doctor_id)
  );

  return visit_row;
end;
$$;

revoke execute on function public.create_visit_from_rdv(uuid, uuid) from public;
grant execute on function public.create_visit_from_rdv(uuid, uuid) to authenticated;

-- Ensure add_to_waiting_room delegates to create_visit_from_rdv
create or replace function public.add_to_waiting_room(
  p_rdv_id uuid,
  p_doctor_id uuid default null
)
returns visits
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_visit_from_rdv(p_rdv_id, p_doctor_id);
end;
$$;

revoke execute on function public.add_to_waiting_room(uuid, uuid) from public;
grant execute on function public.add_to_waiting_room(uuid, uuid) to authenticated;
