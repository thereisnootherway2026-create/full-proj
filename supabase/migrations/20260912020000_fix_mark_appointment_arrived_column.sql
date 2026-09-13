-- Fix mm_mark_appointment_arrived: it wrote rdv.status = 'arrive', but
-- rdv_status_check only allows ('scheduled','confirme','cancelled',
-- 'no_show','completed') — confirmed live, the previous version raised
-- "new row for relation rdv violates check constraint rdv_status_check"
-- on every call, so the function has never actually succeeded. Arrival
-- state lives in the separate arrival_status column (NOT_ARRIVED,
-- WAITING, IN_CONSULTATION, LEFT), exactly as add_to_waiting_room already
-- uses it. This makes mm_mark_appointment_arrived consistent with that
-- existing, working RPC instead of touching the wrong column.
create or replace function public.mm_mark_appointment_arrived(p_rdv_id uuid)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('appointments.mark_arrived');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.arrival_status != 'NOT_ARRIVED' then
    raise exception 'patient has already arrived or left';
  end if;

  update public.rdv
  set arrival_status = 'WAITING',
      arrived_at = now()
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log('APPOINTMENT_ARRIVED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), null);

  return rdv_after;
end;
$$;

grant execute on function public.mm_mark_appointment_arrived(uuid) to authenticated;
