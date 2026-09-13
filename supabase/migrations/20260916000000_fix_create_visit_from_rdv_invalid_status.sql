-- Found while investigating "Ajouter à la salle doesn't stick in File
-- d'attente": create_visit_from_rdv (the correctly-designed RPC that
-- actually creates a durable `visits` row, unlike add_to_waiting_room which
-- only flags rdv.arrival_status) ends by doing
-- `update rdv set status = 'en_attente'` — not a valid value per the live
-- rdv_status_check constraint (scheduled/confirme/cancelled/no_show/
-- completed). Same class of bug already found and fixed twice this pass
-- (confirm_appointment's bogus column, cancel_appointment's invalid
-- 'annule') — this one has simply never been triggered because nothing in
-- the frontend currently calls this RPC (confirmed: addAppointmentToWaitingRoom
-- in visitService.js has zero callers).
--
-- Fix: drop the invalid rdv.status write entirely, matching
-- add_to_waiting_room's own behavior of leaving rdv.status alone and only
-- touching arrival-side state — here that's the visits row itself
-- (status='waiting'), which is the correct signal for File d'attente.
-- Every other authorization/tenant/state check is unchanged.

create or replace function public.create_visit_from_rdv(p_rdv_id uuid, p_doctor_id uuid)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_row public.rdv%rowtype;
  doctor_clinic uuid;
  visit_row public.visits%rowtype;
  qn integer;
begin
  perform public.mm_assert_permission('waiting_room.add_patient');

  select * into rdv_row
  from public.rdv
  where id = p_rdv_id;

  if not found then
    raise exception 'appointment not found';
  end if;

  perform public.mm_assert_same_clinic(rdv_row.cabinet_id);

  select coalesce(clinic_id, cabinet_id) into doctor_clinic
  from public.profiles
  where id = p_doctor_id
    and public.mm_role_key(role) = 'doctor'
    and status = 'active';

  if doctor_clinic is distinct from rdv_row.cabinet_id then
    raise exception 'doctor must belong to the same clinic';
  end if;

  select * into visit_row
  from public.visits
  where rdv_id = p_rdv_id
    and status <> 'cancelled'
  order by created_at desc
  limit 1;

  if found then
    if visit_row.status in ('consultation', 'billing', 'completed') then
      raise exception 'visit already advanced';
    end if;

    if visit_row.doctor_id is distinct from p_doctor_id then
      qn := public.mm_next_queue_number(rdv_row.cabinet_id, p_doctor_id, current_date);
    else
      qn := visit_row.queue_number;
    end if;

    update public.visits
    set doctor_id = p_doctor_id,
        status = 'waiting',
        queue_date = current_date,
        queue_number = coalesce(qn, public.mm_next_queue_number(rdv_row.cabinet_id, p_doctor_id, current_date)),
        queued_at = coalesce(queued_at, now()),
        waiting_at = coalesce(waiting_at, now()),
        queue_sort_at = coalesce(queue_sort_at, now()),
        updated_by = auth.uid(),
        updated_at = now()
    where id = visit_row.id
    returning * into visit_row;
  else
    qn := public.mm_next_queue_number(rdv_row.cabinet_id, p_doctor_id, current_date);

    insert into public.visits (
      clinic_id, patient_id, rdv_id, source, doctor_id, status,
      queue_date, queue_number, queue_sort_at, queued_at, waiting_at,
      created_by, updated_by
    )
    values (
      rdv_row.cabinet_id, rdv_row.patient_id, rdv_row.id, 'appointment', p_doctor_id, 'waiting',
      current_date, qn, now(), now(), now(), auth.uid(), auth.uid()
    )
    returning * into visit_row;
  end if;

  perform public.write_audit_log(
    'PATIENT_WAITING',
    'visit',
    visit_row.id,
    null,
    to_jsonb(visit_row),
    jsonb_build_object('rdv_id', p_rdv_id, 'doctor_id', p_doctor_id)
  );

  return visit_row;
end;
$$;
