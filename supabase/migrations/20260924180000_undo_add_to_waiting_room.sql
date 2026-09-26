-- Undo an accidental "add to the waiting room" (the ↩ arrow on a just-added queue card).
--
-- Why not cancel_visit: it also cancels the appointment (rdv.status = 'cancelled') and needs
-- waiting_room.remove_patient. Undoing a mis-click must instead put things back exactly as they
-- were: the visit is withdrawn and the appointment returns to "not arrived", still booked.
--
-- Deliberately narrow — an "oops" button, not a removal tool:
--   * same permission as adding (waiting_room.add_patient), same clinic;
--   * only while the patient is still 'waiting' (not called, not in consultation);
--   * only within 10 minutes of being added (the UI offers it for less).
-- The visit is marked cancelled (never deleted) and the undo is audited.
-- Safe to re-run.

create or replace function public.undo_add_to_waiting_room(p_visit_id uuid)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
begin
  perform public.mm_assert_permission('waiting_room.add_patient');

  select * into visit_before
  from public.visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'visit not found';
  end if;

  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status <> 'waiting' then
    raise exception 'visit is no longer waiting';
  end if;

  if coalesce(visit_before.waiting_at, visit_before.queued_at, visit_before.created_at) < now() - interval '10 minutes' then
    raise exception 'undo window has expired';
  end if;

  update public.visits
  set status = 'cancelled',
      cancelled_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  -- Appointment back to "not arrived" (it stays booked; create_visit_from_rdv set these).
  if visit_after.rdv_id is not null then
    update public.rdv
    set arrival_status = 'NOT_ARRIVED',
        arrived_at = null
    where id = visit_after.rdv_id
      and arrival_status = 'WAITING';
  end if;

  perform public.write_audit_log(
    'WAITING_ROOM_ADD_UNDONE',
    'visit',
    p_visit_id,
    to_jsonb(visit_before),
    to_jsonb(visit_after),
    jsonb_build_object('rdv_id', visit_after.rdv_id)
  );

  return visit_after;
end;
$$;

revoke execute on function public.undo_add_to_waiting_room(uuid) from public, anon;
grant execute on function public.undo_add_to_waiting_room(uuid) to authenticated;

notify pgrst, 'reload schema';
