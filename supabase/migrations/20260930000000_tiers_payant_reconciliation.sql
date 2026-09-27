-- Tiers payant, stage 3.5: financial model hardening. No new feature.
--
-- Builds on 20260927010000 / 20260928000000 / 20260929000000 without rebuilding them. Adds:
--   1. documentation of the snapshot columns (never a source of truth for current balances)
--   2. third_party_amount can ONLY be written by its derivation (mm_sync_invoice_third_party)
--   3. an invoice cannot be cancelled while a refused amount on it is still unresolved
--   4. invoice_financials: the single server-side reconciliation of every invoice
--
-- Authoritative model (one invoice = one payments row):
--   patient_paid        payments.amount_paid                                   (patient money only)
--   organism_share      payments.third_party_amount = sum of claim allocations  (derived, trigger)
--     allocation(claim) = amount_claimed - refusals re-filed - refusals put on the patient (0 if cancelled)
--   patient_due         amount - organism_share - patient_paid                  (open invoices)
--   organism_received   sum(insurance_settlements.amount)                       (ledger)
--   organism_due        sum over open claims of (claimed - received - rejected)
--   rejected_unresolved sum(insurance_claim_rejections.amount) not yet resolved (nobody owes it yet)
--   waived              sum(insurance_claim_rejections.amount) resolved WAIVED  (nobody owes it)
--   A refusal changes ownership only through an explicit resolution; until then it stays in the
--   organism's share and is neither patient debt nor organism receivable.
-- Every DH of an open invoice sits in exactly one bucket:
--   amount = patient_paid + patient_due + organism_received + organism_due + rejected_unresolved + waived

-- ============================================================ 1. snapshot columns
comment on column public.insurance_claims.patient_share is
  'HISTORICAL SNAPSHOT: patient share of the invoice when this claim was created. Never use it for the current patient balance: that is payments.amount - payments.third_party_amount - payments.amount_paid (see invoice_financials).';
comment on column public.insurance_claims.invoice_amount is
  'HISTORICAL SNAPSHOT: invoice amount when this claim was created. The current amount is payments.amount.';
comment on column public.insurance_claims.amount_received is
  'Cached sum of insurance_settlements for this claim (trigger-maintained, cannot be edited by hand).';
comment on column public.insurance_claims.amount_rejected is
  'Cached sum of insurance_claim_rejections for this claim (trigger-maintained, cannot be edited by hand).';
comment on column public.payments.third_party_amount is
  'Organism share of the invoice, DERIVED from its claims by mm_sync_invoice_third_party. Any other write is refused.';

-- ============================================================ 2. third_party_amount is derived only
-- The derivation raises a transaction-local flag while it writes; any other write is refused.
create or replace function public.mm_sync_invoice_third_party(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tpa numeric;
begin
  if p_invoice_id is null then return; end if;
  select coalesce(sum(public.mm_claim_allocation(c.id)), 0) into v_tpa
  from public.insurance_claims c where c.invoice_id = p_invoice_id;

  perform set_config('mm.third_party_sync', 'on', true);
  update public.payments
  set third_party_amount = v_tpa,
      payment_mode = case when v_tpa > 0 then 'TIERS_PAYANT' else 'PATIENT' end,
      status = case
        when status = 'pending' and amount_paid + v_tpa >= amount then 'paid'
        when status = 'paid' and amount_paid + v_tpa < amount then 'pending'
        else status end,
      updated_at = now()
  where id = p_invoice_id
    and (third_party_amount, payment_mode) is distinct from (v_tpa, case when v_tpa > 0 then 'TIERS_PAYANT' else 'PATIENT' end);
  perform set_config('mm.third_party_sync', 'off', true);
exception when check_violation then
  raise exception 'claims exceed what is still unpaid on the invoice';
end;
$$;
revoke all on function public.mm_sync_invoice_third_party(uuid) from public, anon, authenticated;

create or replace function public.mm_payments_third_party_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.third_party_amount, 0) <> 0 or coalesce(new.payment_mode, 'PATIENT') <> 'PATIENT' then
      raise exception 'third_party_amount is derived from insurance claims';
    end if;
  elsif (new.third_party_amount, new.payment_mode) is distinct from (old.third_party_amount, old.payment_mode)
        and coalesce(current_setting('mm.third_party_sync', true), 'off') <> 'on' then
    raise exception 'third_party_amount is derived from insurance claims';
  end if;
  return new;
end;
$$;
create trigger trg_payments_third_party_guard
  before insert or update of third_party_amount, payment_mode on public.payments
  for each row execute function public.mm_payments_third_party_guard();
revoke all on function public.mm_payments_third_party_guard() from public, anon, authenticated;

-- ============================================================ 3. cancellation
-- Same as the foundation, plus: a refused amount still waiting for a decision blocks the
-- cancellation (the user resolves it first: re-file, patient or waive). Money already received
-- from an organism still blocks it too. Open claims are cancelled with the invoice.
create or replace function public.mm_cancel_claims_for_context(p_invoice_id uuid, p_visit_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
begin
  if exists (
    select 1 from public.insurance_claims
    where status <> 'CANCELLED' and amount_received > 0
      and ((p_invoice_id is not null and invoice_id = p_invoice_id) or (p_visit_id is not null and visit_id = p_visit_id))
  ) then
    raise exception 'an insurance claim on this invoice has already received a settlement';
  end if;
  if exists (
    select 1 from public.insurance_claim_rejections r
    join public.insurance_claims c on c.id = r.claim_id
    where r.resolution is null and c.status <> 'CANCELLED'
      and ((p_invoice_id is not null and c.invoice_id = p_invoice_id) or (p_visit_id is not null and c.visit_id = p_visit_id))
  ) then
    raise exception 'an insurance rejection on this invoice must be resolved first';
  end if;

  for v_claim in
    select * from public.insurance_claims
    where status not in ('CANCELLED', 'SETTLED', 'REJECTED')
      and ((p_invoice_id is not null and invoice_id = p_invoice_id) or (p_visit_id is not null and visit_id = p_visit_id))
    for update
  loop
    update public.insurance_claims
    set status = 'CANCELLED', updated_at = now(),
        notes = concat_ws(E'\n', nullif(notes, ''), p_reason)
    where id = v_claim.id;
    perform public.write_audit_log('INSURANCE_CLAIM_AUTO_CANCELLED', 'insurance_claim', v_claim.id,
      to_jsonb(v_claim), null, jsonb_build_object('reason', p_reason, 'amount', v_claim.amount_claimed, 'invoice_id', v_claim.invoice_id));
  end loop;
end;
$$;
revoke all on function public.mm_cancel_claims_for_context(uuid, uuid, text) from public, anon, authenticated;

-- ============================================================ 4. reconciliation
-- One row per invoice with every bucket, recomputed from the ledgers (never from snapshots), and
-- the checks that must hold. security_invoker: the caller's RLS applies (clinic + billing.view).
-- A cancelled / waived / refunded invoice owes nothing any more: what is neither received nor
-- waived is reported as cancelled_amount.
create or replace view public.invoice_financials
with (security_invoker = true) as
with claim_totals as (
  select c.invoice_id,
    coalesce(sum(c.amount_claimed) filter (where c.status <> 'CANCELLED'), 0) as organism_claimed,
    coalesce(sum(c.amount_claimed - c.amount_received - c.amount_rejected)
      filter (where c.status in ('DRAFT', 'READY', 'SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED')), 0) as organism_due,
    coalesce(sum(case when c.status = 'CANCELLED' then 0 else c.amount_claimed - coalesce((
      select sum(r.amount) from public.insurance_claim_rejections r
      where r.claim_id = c.id and r.resolution in ('REFILED', 'TRANSFERRED_TO_PATIENT')), 0) end), 0) as allocation_derived,
    coalesce(sum(c.amount_received), 0) as received_cached,
    coalesce(sum(c.amount_rejected), 0) as rejected_cached,
    count(*) filter (where c.status in ('DRAFT', 'READY', 'SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED')) as open_claims
  from public.insurance_claims c
  group by c.invoice_id
),
settlement_totals as (
  select c.invoice_id, sum(s.amount) as organism_received
  from public.insurance_settlements s join public.insurance_claims c on c.id = s.claim_id
  group by c.invoice_id
),
rejection_totals as (
  select c.invoice_id,
    sum(r.amount) as rejected_ledger,
    coalesce(sum(r.amount) filter (where r.resolution is null and c.status <> 'CANCELLED'), 0) as rejected_unresolved,
    coalesce(sum(r.amount) filter (where r.resolution = 'WAIVED' and c.status <> 'CANCELLED'), 0) as waived,
    coalesce(sum(r.amount) filter (where r.resolution = 'TRANSFERRED_TO_PATIENT' and c.status <> 'CANCELLED'), 0) as transferred_to_patient,
    coalesce(sum(r.amount) filter (where r.resolution = 'REFILED'), 0) as refiled
  from public.insurance_claim_rejections r join public.insurance_claims c on c.id = r.claim_id
  group by c.invoice_id
),
figures as (
  select p.id as invoice_id, p.clinic_id, p.patient_id, p.status as invoice_status,
    p.status in ('pending', 'paid') as is_open,
    p.amount as invoice_total,
    p.amount_paid as patient_paid,
    p.third_party_amount as organism_share,
    coalesce(ct.organism_claimed, 0) as organism_claimed,
    coalesce(st.organism_received, 0) as organism_received,
    coalesce(ct.organism_due, 0) as organism_due,
    coalesce(rt.rejected_unresolved, 0) as rejected_unresolved,
    coalesce(rt.waived, 0) as waived,
    coalesce(rt.transferred_to_patient, 0) as transferred_to_patient,
    coalesce(rt.refiled, 0) as refiled,
    coalesce(ct.allocation_derived, 0) as allocation_derived,
    coalesce(ct.received_cached, 0) as received_cached,
    coalesce(ct.rejected_cached, 0) as rejected_cached,
    coalesce(rt.rejected_ledger, 0) as rejected_ledger,
    coalesce(ct.open_claims, 0) as open_claims
  from public.payments p
  left join claim_totals ct on ct.invoice_id = p.id
  left join settlement_totals st on st.invoice_id = p.id
  left join rejection_totals rt on rt.invoice_id = p.id
),
buckets as (
  select f.*,
    case when f.is_open then f.invoice_total - f.organism_share - f.patient_paid else 0 end as patient_due,
    case when f.is_open then 0
         else f.invoice_total - f.patient_paid - f.organism_received - f.rejected_unresolved - f.waived end as cancelled_amount
  from figures f
),
checks as (
  select b.*,
    b.patient_paid + b.patient_due + b.organism_received + b.organism_due + b.rejected_unresolved + b.waived + b.cancelled_amount
      as allocated_total,
    array_remove(array[
      case when b.organism_share <> b.allocation_derived then 'organism_share <> sum of claim allocations' end,
      case when b.is_open and b.organism_share <> b.organism_received + b.organism_due + b.rejected_unresolved + b.waived
           then 'organism_share <> received + due + unresolved + waived' end,
      case when b.received_cached <> b.organism_received then 'claims.amount_received <> settlement ledger' end,
      case when b.rejected_cached <> b.rejected_ledger then 'claims.amount_rejected <> rejection ledger' end,
      case when b.patient_due < 0 then 'negative patient_due' end,
      case when b.organism_due < 0 then 'negative organism_due' end,
      case when b.cancelled_amount < 0 then 'negative cancelled_amount' end,
      case when not b.is_open and b.open_claims > 0 then 'open claim on a closed invoice' end
    ], null) as problems
  from buckets b
)
select c.invoice_id, c.clinic_id, c.patient_id, c.invoice_status,
  c.invoice_total, c.patient_paid, c.patient_due,
  c.organism_share, c.organism_claimed, c.organism_received, c.organism_due,
  c.rejected_unresolved, c.waived, c.transferred_to_patient, c.refiled, c.cancelled_amount,
  c.allocated_total,
  case when c.allocated_total = c.invoice_total and cardinality(c.problems) = 0 then 'RECONCILED' else 'INCONSISTENT' end
    as reconciliation_status,
  case when c.allocated_total <> c.invoice_total
       then array_append(c.problems, format('allocated_total %s <> invoice_total %s', c.allocated_total, c.invoice_total))
       else c.problems end as reconciliation_problems
from checks c;

comment on view public.invoice_financials is
  'Single source of truth for every invoice balance (patient and organism). Recomputed from payments and the insurance ledgers; never from claim snapshots. reconciliation_status = INCONSISTENT means the figures must not be shown as-is.';

revoke all on public.invoice_financials from anon;
grant select on public.invoice_financials to authenticated, service_role;

-- Convenience for one invoice (same rows, same RLS).
create or replace function public.invoice_reconciliation(p_invoice_id uuid)
returns setof public.invoice_financials
language sql
stable
security invoker
set search_path = public
as $$ select * from public.invoice_financials where invoice_id = p_invoice_id $$;
revoke all on function public.invoice_reconciliation(uuid) from public, anon;
grant execute on function public.invoice_reconciliation(uuid) to authenticated, service_role;

-- Every invoice must reconcile when this migration lands.
do $$
declare v_bad record;
begin
  for v_bad in select invoice_id, reconciliation_problems from public.invoice_financials where reconciliation_status <> 'RECONCILED' loop
    raise warning 'invoice % does not reconcile: %', v_bad.invoice_id, v_bad.reconciliation_problems;
  end loop;
end $$;

notify pgrst, 'reload schema';
