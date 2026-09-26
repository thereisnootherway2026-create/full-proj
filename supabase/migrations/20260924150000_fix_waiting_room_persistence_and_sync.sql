-- Migration: 20260924150000_fix_waiting_room_persistence_and_sync.sql
--
-- WORKFLOW PERSISTENCE AUDIT & FIX:
-- 1. `create_visit_from_rdv`:
--    - Sets `rdv.arrival_status = 'WAITING'` and `arrived_at = now()`.
--    - Persists durable `public.visits` row (`status = 'waiting'`, `queue_date = current_date`).
--    - Auto-resolves active clinic doctor when `p_doctor_id` is null or omitted.
-- 2. `add_to_waiting_room`:
--    - Harmonized to call `create_visit_from_rdv`, ensuring a real row in `public.visits`
--      is ALWAYS created and persisted in the database whenever "Ajouter à la salle d'attente"
--      is clicked, surviving page refreshes, role switches, and concurrent tabs.

-- Drop any previous signatures to avoid function overloading conflicts
drop function if exists public.add_to_waiting_room(uuid);
drop function if exists public.add_to_waiting_room(uuid, uuid);
drop function if exists public.create_visit_from_rdv(uuid);
drop function if exists public.create_visit_from_rdv(uuid, uuid);

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
        status = 'waiting',
        queue_date = current_date,
        queue_number = coalesce(qn, public.mm_next_queue_number(rdv_row.cabinet_id, resolved_doctor_id, current_date)),
        queued_at = coalesce(queued_at, now()),
        waiting_at = coalesce(waiting_at, now()),
        queue_sort_at = coalesce(queue_sort_at, now()),
        updated_by = auth.uid(),
        updated_at = now()
    where id = visit_row.id
    returning * into visit_row;
  else
    qn := public.mm_next_queue_number(rdv_row.cabinet_id, resolved_doctor_id, current_date);

    insert into public.visits (
      clinic_id, patient_id, rdv_id, source, doctor_id, status,
      queue_date, queue_number, queue_sort_at, queued_at, waiting_at,
      created_by, updated_by
    )
    values (
      rdv_row.cabinet_id, rdv_row.patient_id, rdv_row.id, 'appointment', resolved_doctor_id, 'waiting',
      current_date, qn, now(), now(), now(), auth.uid(), auth.uid()
    )
    returning * into visit_row;
  end if;

  -- Keep rdv arrival_status and arrived_at in perfect sync
  update public.rdv
  set arrival_status = 'WAITING',
      arrived_at = coalesce(arrived_at, now())
  where id = p_rdv_id;

  perform public.write_audit_log(
    'PATIENT_WAITING',
    'visit',
    visit_row.id,
    null,
    to_jsonb(visit_row),
    jsonb_build_object('rdv_id', p_rdv_id, 'doctor_id', resolved_doctor_id)
  );

  return visit_row;
end;
$$;

create or replace function public.add_to_waiting_room(
  p_rdv_id uuid,
  p_doctor_id uuid default null
)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_after public.rdv%rowtype;
begin
  -- create_visit_from_rdv handles permission, tenant, visit creation, rdv arrival update & audit
  perform public.create_visit_from_rdv(p_rdv_id, p_doctor_id);

  select * into rdv_after
  from public.rdv
  where id = p_rdv_id;

  return rdv_after;
end;
$$;

grant execute on function public.create_visit_from_rdv(uuid, uuid) to authenticated;
grant execute on function public.add_to_waiting_room(uuid, uuid) to authenticated;
