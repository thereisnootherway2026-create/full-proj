-- A partial payment closes the visit; the remainder is a debt (Facturation > Débiteurs).
--
-- Before: a short payment left the visit in 'billing' (20260921000000), so it stayed in the
-- cashier flow indefinitely and every earlier-day balance was pushed onto the dashboard.
--
-- Now:
--   * process_visit_payment, partial collection: the visit becomes 'completed' (the
--     consultation is over, the patient has left) and its rdv 'completed'. The payment row
--     stays 'pending' with amount_paid < amount — that open remainder is what Facturation
--     lists under Débiteurs (it reads payments; reste = amount - amount_paid), unchanged.
--   * Collecting that remainder later (from Débiteurs, or when the patient comes back) goes
--     through the same RPC, which now also accepts a 'completed' visit as long as it still
--     has a pending payment with something left to collect. A full collection on a visit
--     that is already completed only settles the payment (visit already closed).
--   * One-off back-fill: visits still in 'billing' that were already partly paid are closed
--     the same way.
--
-- Same signature and grants; the full-payment path is unchanged. A visit with nothing paid
-- yet stays in 'billing' (still at the cashier) as before.

create or replace function public.process_visit_payment(
  p_visit_id uuid,
  p_method text,
  p_amount numeric default null,
  p_partial boolean default false
)
returns public.visits
language plpgsql
security definer
set search_path = public
as $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  payment_before public.payments%rowtype;
  payment_after public.payments%rowtype;
  v_remaining numeric;
  v_collect numeric;
  v_full boolean;
  v_debt_collection boolean;
begin
  perform public.mm_assert_permission('billing.collect');

  if p_method not in ('cash', 'card', 'transfer', 'insurance', 'package', 'free') then
    raise exception 'invalid payment method';
  end if;

  select * into visit_before from public.visits where id = p_visit_id for update;
  if not found then raise exception 'visit not found'; end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  -- 'billing': at the cashier now. 'completed': a closed visit whose balance is still owed
  -- (checked just below: it must have a pending payment with something left).
  if visit_before.status not in ('billing', 'completed') then
    raise exception 'visit is not in billing';
  end if;
  v_debt_collection := visit_before.status = 'completed';

  select * into payment_before
  from public.payments
  where visit_id = p_visit_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    if v_debt_collection then raise exception 'visit is not in billing'; end if;
    raise exception 'pending payment not found';
  end if;

  v_remaining := payment_before.amount - payment_before.amount_paid;
  if v_remaining <= 0 then raise exception 'nothing left to collect'; end if;

  v_collect := coalesce(p_amount, v_remaining);
  if v_collect <= 0 or v_collect > v_remaining then
    raise exception 'invalid payment amount: % exceeds remaining balance %', v_collect, v_remaining;
  end if;

  v_full := v_collect = v_remaining;
  if not v_full and not coalesce(p_partial, false) then
    raise exception 'partial payment must be explicit: collecting % of remaining % (pass p_partial => true)', v_collect, v_remaining;
  end if;

  update public.payments
  set amount_paid = amount_paid + v_collect,
      status = case when v_full then 'paid' else 'pending' end,
      method = p_method,
      received_by = auth.uid(),
      paid_at = now(),
      updated_at = now()
  where id = payment_before.id
  returning * into payment_after;

  if v_debt_collection then
    -- Visit already closed: only the payment moves. Fully settled -> mark the consultation
    -- and rdv paid, as a same-day full payment would have.
    visit_after := visit_before;
    if v_full then
      update public.consultations set statut = 'paye', updated_at = now() where id = payment_after.consultation_id;
      if visit_after.rdv_id is not null then
        update public.rdv set payment_status = 'PAID'
        where id = visit_after.rdv_id and cabinet_id = visit_after.clinic_id;
      end if;
    end if;
  else
    -- At the cashier: full OR partial, the visit is over and leaves the queue.
    update public.visits
    set status = 'completed',
        completed_at = now(),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_visit_id
    returning * into visit_after;

    if v_full then
      update public.consultations set statut = 'paye', updated_at = now() where id = payment_after.consultation_id;
    end if;

    if visit_after.rdv_id is not null then
      update public.rdv
      set status = 'completed', payment_status = case when v_full then 'PAID' else 'UNPAID' end
      where id = visit_after.rdv_id and cabinet_id = visit_after.clinic_id;
    end if;
  end if;

  perform public.write_audit_log(
    'PAYMENT_PROCESSED', 'payment', payment_after.id, to_jsonb(payment_before), to_jsonb(payment_after),
    jsonb_build_object(
      'billed', payment_after.amount,
      'collected', v_collect,
      'total_collected', payment_after.amount_paid,
      'remaining', payment_after.amount - payment_after.amount_paid,
      'partial', not v_full,
      'debt_collection', v_debt_collection
    )
  );
  if not v_debt_collection then
    perform public.write_audit_log(
      case when v_full then 'PATIENT_PAID' else 'VISIT_CLOSED_WITH_BALANCE' end,
      'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null
    );
  end if;

  return visit_after;
end;
$$;

revoke all on function public.process_visit_payment(uuid, text, numeric, boolean) from public, anon;
grant execute on function public.process_visit_payment(uuid, text, numeric, boolean) to authenticated, service_role;

-- Back-fill: partly-paid visits still sitting in 'billing' are closed with their balance
-- left as a debt. Visits with nothing paid are left in billing (still at the cashier).
do $$
declare
  v_closed int;
begin
  with partly_paid as (
    select distinct v.id, v.rdv_id, v.clinic_id
    from public.visits v
    join public.payments p on p.visit_id = v.id and p.status = 'pending'
    where v.status = 'billing' and p.amount_paid > 0 and p.amount_paid < p.amount
  ), closed as (
    update public.visits v
    set status = 'completed', completed_at = coalesce(v.completed_at, now()), updated_at = now()
    from partly_paid pp
    where v.id = pp.id
    returning v.id, v.rdv_id, v.clinic_id
  )
  update public.rdv r
  set status = 'completed', payment_status = 'UNPAID'
  from closed c
  where r.id = c.rdv_id and r.cabinet_id = c.clinic_id and r.status <> 'completed';

  select count(*) into v_closed
  from public.visits v
  join public.payments p on p.visit_id = v.id and p.status = 'pending'
  where v.status = 'completed' and p.amount_paid > 0 and p.amount_paid < p.amount;
  raise notice '% visit(s) now closed with an open balance', v_closed;
end;
$$;

notify pgrst, 'reload schema';
