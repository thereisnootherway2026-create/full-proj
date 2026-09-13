-- PRODUCTION HARDENING AUDIT — state-machine gaps found while reviewing
-- every rdv/visit/payment RPC live:
--
-- 1. reschedule_appointment had permission + tenant checks but no state
--    check at all — a cancelled or completed appointment could be
--    "rescheduled" back to a future date, silently resurrecting it.
--    confirm_appointment_v2 already blocks this same class of bug; mirror it.
--
-- 2. cancel_appointment_v2 blocked cancelling while a patient is
--    WAITING/IN_CONSULTATION, but not an already-completed appointment.
--
-- 3. process_visit_payment trusted a client-supplied p_amount outright,
--    only using coalesce(p_amount, amount) — a caller with billing.collect
--    could pass any amount (0, negative, far above what's owed) and it
--    would still be written as the paid amount and close out the visit as
--    completed. The authoritative due amount is payment_before.amount (set
--    by complete_consultation when the pending payment row was created).
--    Bound p_amount to (0, payment_before.amount] — full or honest partial
--    settlement still works exactly as before, but a caller can no longer
--    close out an invoice for an arbitrary token amount or overshoot it.

create or replace function public.reschedule_appointment(p_rdv_id uuid, p_scheduled_at timestamp with time zone)
returns rdv
language plpgsql
security definer
set search_path = public
as $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  perform public.mm_assert_permission('appointments.update');

  if p_scheduled_at is null then
    raise exception 'scheduled_at is required';
  end if;

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.status in ('cancelled', 'completed') then
    raise exception 'cannot reschedule a cancelled or completed appointment';
  end if;

  update public.rdv
  set date_rdv = p_scheduled_at
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log(
    'APPOINTMENT_RESCHEDULED', 'rdv', p_rdv_id,
    to_jsonb(rdv_before), to_jsonb(rdv_after),
    jsonb_build_object('scheduled_at', p_scheduled_at)
  );

  return rdv_after;
end;
$$;

create or replace function public.cancel_appointment_v2(p_rdv_id uuid, p_reason text default null::text)
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

  perform public.mm_assert_permission('appointments.cancel');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.status = 'completed' then
    raise exception 'cannot cancel a completed appointment';
  end if;

  if rdv_before.arrival_status in ('WAITING', 'IN_CONSULTATION') then
    raise exception 'cannot cancel an appointment while patient is waiting or in consultation';
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'rdv' and column_name = 'status') then
    update public.rdv set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason where id = p_rdv_id returning * into rdv_after;
  else
    update public.rdv set statut = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason where id = p_rdv_id returning * into rdv_after;
  end if;

  perform public.write_audit_log('APPOINTMENT_CANCELLED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), jsonb_build_object('reason', p_reason));

  return rdv_after;
end;
$$;

create or replace function public.process_visit_payment(p_visit_id uuid, p_method text, p_amount numeric default null::numeric)
returns visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  payment_before public.payments%rowtype;
  payment_after public.payments%rowtype;
  v_amount numeric;
begin
  perform public.mm_assert_permission('billing.collect');

  if p_method not in ('cash', 'card', 'transfer', 'insurance', 'package', 'free') then
    raise exception 'invalid payment method';
  end if;

  select * into visit_before from public.visits where id = p_visit_id for update;
  if not found then raise exception 'visit not found'; end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status <> 'billing' then
    raise exception 'visit is not in billing';
  end if;

  select * into payment_before
  from public.payments
  where visit_id = p_visit_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then raise exception 'pending payment not found'; end if;

  v_amount := coalesce(p_amount, payment_before.amount);
  if v_amount <= 0 or v_amount > payment_before.amount then
    raise exception 'invalid payment amount';
  end if;

  update public.payments
  set status = 'paid',
      method = p_method,
      amount = v_amount,
      received_by = auth.uid(),
      paid_at = now(),
      updated_at = now()
  where id = payment_before.id
  returning * into payment_after;

  update public.visits
  set status = 'completed',
      completed_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  update public.consultations
  set statut = 'paye',
      updated_at = now()
  where id = payment_after.consultation_id;

  if visit_after.rdv_id is not null then
    update public.rdv set status = 'termine' where id = visit_after.rdv_id;
  end if;

  perform public.write_audit_log('PAYMENT_PROCESSED', 'payment', payment_after.id, to_jsonb(payment_before), to_jsonb(payment_after), null);
  perform public.write_audit_log('PATIENT_PAID', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null);

  return visit_after;
end;
$$;
