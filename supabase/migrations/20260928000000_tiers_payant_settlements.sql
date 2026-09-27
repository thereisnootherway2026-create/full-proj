-- Tiers payant, stage 2: settlement ledger + explicit resolution of rejected amounts.
--
-- Builds on 20260927010000_tiers_payant_foundation.sql (coverage -> organization -> payment mode
-- -> claim). Nothing there is rebuilt; this migration only adds:
--
--   insurance_settlements   one immutable row per payment received from an organism. It is the
--                           authoritative history: insurance_claims.amount_received is only a
--                           cached sum of it, maintained by trigger, and cannot be edited by hand.
--                           Organism money never goes into payments.amount_paid (patient money).
--
--   rejection resolution    an amount an organism refuses no longer vanishes. It stays "to be
--                           resolved" until a user explicitly chooses one of:
--                             REFILED                  a new claim (READY) for the refused amount,
--                                                      linked to the rejected one (kept as history)
--                             TRANSFERRED_TO_PATIENT   the amount becomes patient debt on the same
--                                                      invoice (third_party_amount goes down)
--                             WAIVED                   abandoned: nobody owes it, nobody paid it
--                           The application never picks one on its own.
--
-- Outstanding on a claim = amount_claimed - sum(settlements) - amount_rejected.

-- ============================================================ 1. settlement ledger
-- target of the composite foreign key: a settlement's claim, clinic, patient and organization
-- must all be the claim's own
alter table public.insurance_claims
  add constraint insurance_claims_id_clinic_patient_org_key unique (id, clinic_id, patient_id, organization_id);

create table public.insurance_settlements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.cabinets(id) on delete cascade,
  claim_id uuid not null,
  organization_id uuid not null,
  patient_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  received_at timestamptz not null default now(),
  -- how organisms actually pay a cabinet (cards are a patient-only method)
  payment_method text not null check (payment_method in ('BANK_TRANSFER', 'CHECK', 'CASH', 'OTHER')),
  reference text,
  notes text,
  -- client-generated key per "Enregistrer un règlement" form: a double submit returns the first row
  idempotency_key uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint insurance_settlements_claim_fkey
    foreign key (claim_id, clinic_id, patient_id, organization_id)
    references public.insurance_claims(id, clinic_id, patient_id, organization_id),
  constraint insurance_settlements_idempotency_key unique (clinic_id, idempotency_key)
);
create index insurance_settlements_claim on public.insurance_settlements (claim_id);
create index insurance_settlements_clinic_received on public.insurance_settlements (clinic_id, received_at desc);

alter table public.insurance_settlements enable row level security;
create policy insurance_settlements_select on public.insurance_settlements for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
create policy insurance_settlements_view_permission_gate on public.insurance_settlements as restrictive for select
  using (public.is_admin() or public.mm_has_permission('billing.view'));
create policy insurance_settlements_no_direct_write on public.insurance_settlements for all using (false) with check (false);
revoke all on public.insurance_settlements from anon;
revoke insert, update, delete, truncate on public.insurance_settlements from authenticated;
grant select on public.insurance_settlements to authenticated;
grant all on public.insurance_settlements to service_role;

-- ============================================================ legacy receipts (before the ledger's triggers exist)
-- Before 20260927010000 an organism's payment was collected as a PATIENT payment
-- (process_visit_payment 'insurance'), so it sits inside payments.amount_paid and the foundation
-- kept it there (third_party_amount = what was still owed). That money is moved into the ledger:
-- one settlement per such claim, removed from amount_paid, and third_party_amount restored to the
-- full organism share. Only rows written by that old path (payment method 'insurance') qualify;
-- since the foundation, 'insurance' cannot be used as a patient payment method any more.
insert into public.insurance_settlements (clinic_id, claim_id, organization_id, patient_id, amount, received_at, payment_method, notes)
select c.clinic_id, c.id, c.organization_id, c.patient_id, c.amount_received, coalesce(c.received_at, c.updated_at), 'OTHER',
       'Reprise : règlement enregistré avant le registre des règlements organismes.'
from public.insurance_claims c
join public.payments p on p.id = c.invoice_id
where c.amount_received > 0 and p.method = 'insurance'
  and not exists (select 1 from public.insurance_settlements s where s.claim_id = c.id);

update public.payments p
set amount_paid = p.amount_paid - x.received,
    third_party_amount = p.third_party_amount + x.received,
    payment_mode = 'TIERS_PAYANT',
    method = null, -- the remaining amount_paid is the patient's; its method is unknown
    updated_at = now()
from (
  select c.invoice_id, sum(c.amount_received) as received
  from public.insurance_claims c
  where c.amount_received > 0 and c.status <> 'CANCELLED'
  group by c.invoice_id
) x
where x.invoice_id = p.id and p.method = 'insurance';

-- Any other amount_received (a claim settled through the foundation's own RPC in a test
-- environment) gets its ledger row too, without touching patient money.
insert into public.insurance_settlements (clinic_id, claim_id, organization_id, patient_id, amount, received_at, payment_method, notes)
select c.clinic_id, c.id, c.organization_id, c.patient_id, c.amount_received, coalesce(c.received_at, c.updated_at), 'OTHER',
       'Reprise : règlement enregistré avant le registre des règlements organismes.'
from public.insurance_claims c
where c.amount_received > 0
  and not exists (select 1 from public.insurance_settlements s where s.claim_id = c.id);

-- A receipt is a financial event: never edited, never deleted.
create or replace function public.mm_insurance_settlements_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'insurance settlements are immutable';
end;
$$;
create trigger trg_insurance_settlements_immutable
  before update or delete on public.insurance_settlements
  for each row execute function public.mm_insurance_settlements_immutable();

-- Guard (before insert): the claim must be awaiting money, and the receipt can never exceed what
-- the organism still owes. The claim row is locked, so concurrent receipts are serialized.
create or replace function public.mm_insurance_settlements_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
  v_open numeric;
begin
  select * into v_claim from public.insurance_claims where id = new.claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  if v_claim.status not in ('SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED') then
    raise exception 'claim must be submitted before a settlement';
  end if;
  v_open := v_claim.amount_claimed - v_claim.amount_rejected
    - coalesce((select sum(amount) from public.insurance_settlements where claim_id = new.claim_id), 0);
  if new.amount > v_open then
    raise exception 'settlement % exceeds the outstanding amount %', new.amount, v_open;
  end if;
  return new;
end;
$$;
create trigger trg_insurance_settlements_before_insert
  before insert on public.insurance_settlements
  for each row execute function public.mm_insurance_settlements_before_insert();

-- Status from the amounts: money still expected -> PARTIALLY_SETTLED (or unchanged while nothing
-- was paid), nothing expected -> SETTLED if anything was paid, else REJECTED.
create or replace function public.mm_claim_status_for_amounts(
  p_current text, p_claimed numeric, p_received numeric, p_rejected numeric
)
returns text
language sql
immutable
as $$
  select case
    when p_received + p_rejected < p_claimed then
      case when p_received > 0 then 'PARTIALLY_SETTLED'
           when p_rejected > 0 then 'PROCESSING'
           else p_current end
    when p_received > 0 then 'SETTLED'
    else 'REJECTED'
  end
$$;

-- After insert: the claim's cached total and status follow the ledger.
create or replace function public.mm_insurance_settlements_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received numeric;
begin
  select coalesce(sum(amount), 0) into v_received from public.insurance_settlements where claim_id = new.claim_id;
  update public.insurance_claims
  set amount_received = v_received,
      received_at = greatest(coalesce(received_at, new.received_at), new.received_at),
      status = public.mm_claim_status_for_amounts(status, amount_claimed, v_received, amount_rejected),
      updated_at = now()
  where id = new.claim_id;
  return null;
end;
$$;
create trigger trg_insurance_settlements_after_insert
  after insert on public.insurance_settlements
  for each row execute function public.mm_insurance_settlements_after_insert();

-- ============================================================ 2. claim: lineage + rejection resolution
alter table public.insurance_claims
  add column previous_claim_id uuid references public.insurance_claims(id),
  add column rejection_resolution text
    check (rejection_resolution in ('REFILED', 'TRANSFERRED_TO_PATIENT', 'WAIVED')),
  add column resolution_note text,
  add column resolved_at timestamptz,
  add column resolved_by uuid,
  add constraint insurance_claims_resolution_check check (
    rejection_resolution is null
    or (amount_rejected > 0 and resolved_at is not null and status in ('REJECTED', 'SETTLED'))
  );
-- a rejected claim is re-filed at most once (double click safe)
create unique index insurance_claims_one_refile on public.insurance_claims (previous_claim_id) where previous_claim_id is not null;

-- One OPEN claim per invoice. A rejected / settled claim stays as history next to its re-filing.
drop index if exists public.insurance_claims_one_live_per_invoice;
create unique index insurance_claims_one_open_per_invoice on public.insurance_claims (invoice_id)
  where status in ('DRAFT', 'READY', 'SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED');

-- Context stays immutable. A closed claim only accepts its rejection resolution. amount_received
-- can only ever equal the ledger's sum: editing it by hand cannot make a claim "settled".
create or replace function public.mm_insurance_claims_immutable_context()
returns trigger
language plpgsql
as $$
begin
  if (new.clinic_id, new.patient_id, new.invoice_id, new.visit_id, new.coverage_id, new.organization_id,
      new.claim_type, new.invoice_amount, new.amount_claimed, new.patient_share,
      new.coverage_type_snapshot, new.organization_name_snapshot, new.membership_number_snapshot,
      new.beneficiary_type_snapshot, new.created_at, new.created_by, new.previous_claim_id)
     is distinct from
     (old.clinic_id, old.patient_id, old.invoice_id, old.visit_id, old.coverage_id, old.organization_id,
      old.claim_type, old.invoice_amount, old.amount_claimed, old.patient_share,
      old.coverage_type_snapshot, old.organization_name_snapshot, old.membership_number_snapshot,
      old.beneficiary_type_snapshot, old.created_at, old.created_by, old.previous_claim_id) then
    raise exception 'claim context is immutable';
  end if;
  if new.amount_received is distinct from old.amount_received
     and new.amount_received <> coalesce((select sum(amount) from public.insurance_settlements where claim_id = new.id), 0) then
    raise exception 'amount_received is derived from insurance_settlements';
  end if;
  if old.rejection_resolution is not null
     and (new.rejection_resolution, new.resolution_note, new.resolved_at, new.resolved_by, new.status, new.amount_rejected)
         is distinct from (old.rejection_resolution, old.resolution_note, old.resolved_at, old.resolved_by, old.status, old.amount_rejected) then
    raise exception 'rejection already resolved';
  end if;
  if old.status in ('SETTLED', 'CANCELLED', 'REJECTED')
     and (new.status, new.amount_received, new.amount_rejected, new.rejection_reason, new.external_reference, new.submitted_at, new.received_at)
         is distinct from (old.status, old.amount_received, old.amount_rejected, old.rejection_reason, old.external_reference, old.submitted_at, old.received_at) then
    raise exception 'claim is closed';
  end if;
  return new;
end;
$$;

-- ============================================================ 3. RPCs
-- The foundation's combined "received + rejected" call is split into explicit events.
drop function if exists public.record_claim_settlement(uuid, numeric, numeric, text, text, timestamptz);
drop function if exists public.reject_insurance_claim(uuid, text);

-- Money received from the organism. Idempotent on p_idempotency_key.
create or replace function public.record_insurance_settlement(
  p_claim_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_received_at timestamptz default null,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns public.insurance_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
  v_row public.insurance_settlements;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_claim from public.insurance_claims where id = p_claim_id;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_claim.clinic_id);

  if p_idempotency_key is not null then
    select * into v_row from public.insurance_settlements
    where clinic_id = v_claim.clinic_id and idempotency_key = p_idempotency_key;
    if found then
      if v_row.claim_id <> p_claim_id or v_row.amount <> p_amount then
        raise exception 'idempotency key already used for another settlement';
      end if;
      return v_row;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'invalid settlement amounts'; end if;
  if p_received_at is not null and p_received_at > now() + interval '1 day' then
    raise exception 'settlement date is in the future';
  end if;

  begin
    insert into public.insurance_settlements (
      clinic_id, claim_id, organization_id, patient_id, amount, received_at, payment_method,
      reference, notes, idempotency_key, created_by
    ) values (
      v_claim.clinic_id, v_claim.id, v_claim.organization_id, v_claim.patient_id, p_amount,
      coalesce(p_received_at, now()), p_payment_method, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''),
      p_idempotency_key, auth.uid()
    ) returning * into v_row;
  exception when unique_violation then
    -- the same form submitted twice at the same moment: the first receipt wins
    select * into v_row from public.insurance_settlements
    where clinic_id = v_claim.clinic_id and idempotency_key = p_idempotency_key;
    return v_row;
  end;

  perform public.write_audit_log('INSURANCE_SETTLEMENT_RECEIVED', 'insurance_claim', v_claim.id, to_jsonb(v_claim),
    (select to_jsonb(c) from public.insurance_claims c where c.id = v_claim.id),
    jsonb_build_object('settlement_id', v_row.id, 'amount', v_row.amount, 'method', v_row.payment_method,
                       'reference', v_row.reference, 'invoice_id', v_claim.invoice_id, 'organization', v_claim.organization_name_snapshot));
  return v_row;
end;
$$;

-- The organism refuses (part of) what it still owes. Default: all of it. The refused amount is
-- then waiting for an explicit resolution.
create or replace function public.reject_insurance_claim(p_claim_id uuid, p_reason text, p_amount numeric default null)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
  v_open numeric;
  v_amount numeric;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);

  if v_before.status not in ('SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED') then
    raise exception 'claim must be submitted before a rejection';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'a rejection reason is required'; end if;
  v_open := v_before.amount_claimed - v_before.amount_received - v_before.amount_rejected;
  v_amount := coalesce(p_amount, v_open);
  if v_amount <= 0 or v_amount > v_open then
    raise exception 'rejection % exceeds the outstanding amount %', v_amount, v_open;
  end if;

  update public.insurance_claims
  set amount_rejected = amount_rejected + v_amount,
      rejection_reason = btrim(p_reason),
      status = public.mm_claim_status_for_amounts(status, amount_claimed, amount_received, amount_rejected + v_amount),
      updated_at = now()
  where id = p_claim_id
  returning * into v_after;

  perform public.write_audit_log('INSURANCE_CLAIM_REJECTED', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('amount', v_amount, 'reason', btrim(p_reason), 'invoice_id', v_before.invoice_id));
  return v_after;
end;
$$;

-- Shared checks for the three resolutions.
create or replace function public.mm_lock_unresolved_rejection(p_claim_id uuid)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_claim from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_claim.clinic_id);
  if v_claim.status not in ('REJECTED', 'SETTLED') or v_claim.amount_rejected <= 0 then
    raise exception 'claim has no rejected amount to resolve';
  end if;
  if v_claim.rejection_resolution is not null then raise exception 'rejection already resolved'; end if;
  return v_claim;
end;
$$;
revoke all on function public.mm_lock_unresolved_rejection(uuid) from public, anon, authenticated;

-- Resolution 1: re-file. A NEW claim (READY) for the refused amount on the same invoice; the
-- rejected claim stays as it is, marked REFILED and linked. The invoice's third-party share is
-- unchanged: no invoice, amount or patient payment is duplicated.
create or replace function public.refile_insurance_claim(p_claim_id uuid, p_coverage_id uuid default null, p_notes text default null)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.insurance_claims;
  v_cov public.patient_coverages;
  v_org public.insurance_organizations;
  v_pay public.payments;
  v_new public.insurance_claims;
begin
  v_old := public.mm_lock_unresolved_rejection(p_claim_id);

  select * into v_pay from public.payments where id = v_old.invoice_id for update;
  if v_pay.status not in ('pending', 'paid') then raise exception 'invoice is not open (status %)', v_pay.status; end if;

  select * into v_cov from public.patient_coverages where id = coalesce(p_coverage_id, v_old.coverage_id);
  if not found then raise exception 'coverage not found'; end if;
  perform public.mm_assert_same_clinic(v_cov.clinic_id);
  if v_cov.patient_id <> v_old.patient_id then raise exception 'coverage belongs to another patient'; end if;
  if not v_cov.is_active or v_cov.coverage_type = 'NONE' then raise exception 'coverage is not active'; end if;
  select * into v_org from public.insurance_organizations where id = v_cov.organization_id;
  if not v_org.is_active then raise exception 'organization is inactive'; end if;

  insert into public.insurance_claims (
    clinic_id, invoice_id, visit_id, patient_id, coverage_id, organization_id, claim_type, status,
    invoice_amount, amount_claimed, patient_share, notes, created_by, previous_claim_id,
    coverage_type_snapshot, organization_name_snapshot, membership_number_snapshot, beneficiary_type_snapshot
  ) values (
    v_old.clinic_id, v_old.invoice_id, v_old.visit_id, v_old.patient_id, v_cov.id, v_org.id, 'TIERS_PAYANT', 'READY',
    v_old.invoice_amount, v_old.amount_rejected, v_old.invoice_amount - v_old.amount_rejected,
    coalesce(nullif(btrim(p_notes), ''), 'Redépôt du dossier rejeté : ' || v_old.rejection_reason), auth.uid(), v_old.id,
    v_cov.coverage_type, v_org.name, v_cov.membership_number, v_cov.beneficiary_type
  ) returning * into v_new;

  update public.insurance_claims
  set rejection_resolution = 'REFILED', resolved_at = now(), resolved_by = auth.uid(),
      resolution_note = 'Redéposé : dossier ' || v_new.id, updated_at = now()
  where id = v_old.id;

  perform public.write_audit_log('INSURANCE_CLAIM_REFILED', 'insurance_claim', v_new.id, to_jsonb(v_old), to_jsonb(v_new),
    jsonb_build_object('previous_claim_id', v_old.id, 'amount', v_new.amount_claimed, 'rejection_reason', v_old.rejection_reason,
                       'invoice_id', v_old.invoice_id));
  return v_new;
end;
$$;

-- Resolution 2: the refused amount becomes the patient's, on the same invoice (existing debt
-- model: third_party_amount goes down, so amount - third_party_amount - amount_paid goes up).
-- No payment is created; the invoice re-opens if the patient now owes something.
create or replace function public.transfer_rejection_to_patient(p_claim_id uuid, p_note text default null)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
  v_pay_before public.payments;
  v_pay public.payments;
  v_after public.insurance_claims;
begin
  v_claim := public.mm_lock_unresolved_rejection(p_claim_id);

  select * into v_pay_before from public.payments where id = v_claim.invoice_id for update;
  if v_pay_before.status not in ('pending', 'paid') then raise exception 'invoice is not open (status %)', v_pay_before.status; end if;
  if v_claim.amount_rejected > v_pay_before.third_party_amount then
    raise exception 'rejected amount % exceeds the invoice third-party share %', v_claim.amount_rejected, v_pay_before.third_party_amount;
  end if;

  update public.payments
  set third_party_amount = third_party_amount - v_claim.amount_rejected,
      payment_mode = case when third_party_amount - v_claim.amount_rejected > 0 then 'TIERS_PAYANT' else 'PATIENT' end,
      status = case when amount_paid < amount - (third_party_amount - v_claim.amount_rejected) then 'pending' else status end,
      updated_at = now()
  where id = v_pay_before.id
  returning * into v_pay;

  update public.insurance_claims
  set rejection_resolution = 'TRANSFERRED_TO_PATIENT', resolved_at = now(), resolved_by = auth.uid(),
      resolution_note = nullif(btrim(p_note), ''), updated_at = now()
  where id = v_claim.id
  returning * into v_after;

  perform public.write_audit_log('INSURANCE_REJECTION_TRANSFERRED_TO_PATIENT', 'insurance_claim', v_claim.id, to_jsonb(v_claim), to_jsonb(v_after),
    jsonb_build_object('amount', v_claim.amount_rejected, 'invoice_id', v_claim.invoice_id,
                       'patient_due_before', v_pay_before.amount - v_pay_before.third_party_amount - v_pay_before.amount_paid,
                       'patient_due_after', v_pay.amount - v_pay.third_party_amount - v_pay.amount_paid));
  return v_after;
end;
$$;

-- Resolution 3: abandon / exonerate. Nobody owes the refused amount and it is never counted as
-- received. (payments.status 'waived' waives a whole invoice, so it cannot carry a partial amount;
-- the waiver is recorded on the claim, with who, when, amount and reason.)
create or replace function public.waive_rejected_amount(p_claim_id uuid, p_reason text)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
  v_after public.insurance_claims;
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'a waiver reason is required'; end if;
  v_claim := public.mm_lock_unresolved_rejection(p_claim_id);

  update public.insurance_claims
  set rejection_resolution = 'WAIVED', resolved_at = now(), resolved_by = auth.uid(),
      resolution_note = btrim(p_reason), updated_at = now()
  where id = v_claim.id
  returning * into v_after;

  perform public.write_audit_log('INSURANCE_REJECTION_WAIVED', 'insurance_claim', v_claim.id, to_jsonb(v_claim), to_jsonb(v_after),
    jsonb_build_object('amount', v_claim.amount_rejected, 'reason', btrim(p_reason), 'invoice_id', v_claim.invoice_id));
  return v_after;
end;
$$;

-- Lifecycle moves without money (foundation version, minus the in-place "REJECTED -> READY"
-- re-file and "REJECTED -> CANCELLED": a rejected claim is now resolved explicitly instead).
create or replace function public.update_claim_status(
  p_claim_id uuid,
  p_status text,
  p_external_reference text default null,
  p_notes text default null
)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
  v_allowed text[];
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);

  v_allowed := case v_before.status
    when 'DRAFT' then array['READY', 'CANCELLED']
    when 'READY' then array['DRAFT', 'SUBMITTED', 'CANCELLED']
    when 'SUBMITTED' then array['PROCESSING', 'CANCELLED']
    when 'PROCESSING' then array['CANCELLED']
    else array[]::text[]
  end;
  if not (p_status = any (v_allowed)) then
    raise exception 'invalid claim transition % -> %', v_before.status, p_status;
  end if;
  if p_status = 'CANCELLED' and (v_before.amount_received > 0 or v_before.amount_rejected > 0) then
    raise exception 'claim already received a settlement';
  end if;

  update public.insurance_claims
  set status = p_status,
      external_reference = coalesce(nullif(btrim(p_external_reference), ''), external_reference),
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      submitted_at = case when p_status = 'SUBMITTED' then now() else submitted_at end,
      updated_at = now()
  where id = p_claim_id
  returning * into v_after;

  -- Cancelling a claim hands its amount back to the patient's side of the invoice. A re-filed
  -- claim only carries the refused part, so only that part moves.
  if p_status = 'CANCELLED' then
    update public.payments
    set third_party_amount = third_party_amount - least(v_before.amount_claimed, third_party_amount),
        payment_mode = case when third_party_amount - least(v_before.amount_claimed, third_party_amount) > 0 then 'TIERS_PAYANT' else 'PATIENT' end,
        status = case when status = 'paid' and amount_paid < amount - (third_party_amount - least(v_before.amount_claimed, third_party_amount))
                      then 'pending' else status end,
        updated_at = now()
    where id = v_before.invoice_id and payment_mode = 'TIERS_PAYANT';
  end if;

  perform public.write_audit_log(
    case p_status when 'SUBMITTED' then 'INSURANCE_CLAIM_SUBMITTED' when 'CANCELLED' then 'INSURANCE_CLAIM_CANCELLED' else 'INSURANCE_CLAIM_STATUS' end,
    'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('from', v_before.status, 'to', p_status, 'amount', v_before.amount_claimed, 'invoice_id', v_before.invoice_id));
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- grants
revoke all on function public.mm_insurance_settlements_immutable() from public, anon, authenticated;
revoke all on function public.mm_insurance_settlements_before_insert() from public, anon, authenticated;
revoke all on function public.mm_insurance_settlements_after_insert() from public, anon, authenticated;
revoke all on function public.record_insurance_settlement(uuid, numeric, text, timestamptz, text, text, uuid) from public, anon;
revoke all on function public.reject_insurance_claim(uuid, text, numeric) from public, anon;
revoke all on function public.refile_insurance_claim(uuid, uuid, text) from public, anon;
revoke all on function public.transfer_rejection_to_patient(uuid, text) from public, anon;
revoke all on function public.waive_rejected_amount(uuid, text) from public, anon;
revoke all on function public.update_claim_status(uuid, text, text, text) from public, anon;
grant execute on function public.record_insurance_settlement(uuid, numeric, text, timestamptz, text, text, uuid) to authenticated, service_role;
grant execute on function public.reject_insurance_claim(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.refile_insurance_claim(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.transfer_rejection_to_patient(uuid, text) to authenticated, service_role;
grant execute on function public.waive_rejected_amount(uuid, text) to authenticated, service_role;
grant execute on function public.update_claim_status(uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
