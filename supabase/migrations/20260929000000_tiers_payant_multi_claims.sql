-- Tiers payant, stage 3: several claims per invoice + per-rejection resolution.
--
-- Builds on 20260927010000 (foundation) and 20260928000000 (settlement ledger). Neither is rebuilt.
--
-- What changes
--   One invoice can carry several claims: e.g. AMO 400 + complementary 100 on a 500 invoice, or
--   a rejected claim and its re-filing. The invoice is never duplicated: claims only allocate
--   responsibility against it.
--
--   Uniqueness follows the claim's real context instead of the invoice:
--     original claims   one non-cancelled claim per (invoice, organization)
--     re-filings        one per rejection (source_rejection_id)
--
--   Rejections become a ledger (insurance_claim_rejections), like settlements. Each refused amount
--   is resolved on its own (re-file / patient / waive), even while the rest of the claim is still
--   being paid. claim.amount_rejected is a cached sum of that ledger.
--
--   payments.third_party_amount is no longer written by hand: it is DERIVED from the claims, as
--   the sum of each claim's allocation
--       allocation = amount_claimed - rejections re-filed elsewhere - rejections put on the patient
--       (0 for a cancelled claim)
--   so the existing check  amount_paid + third_party_amount <= amount  now refuses any
--   over-allocation of an invoice at the database level.
--
-- Every amount of an invoice sits in exactly one bucket:
--   amount = patient paid + patient receivable
--          + organism received + organism receivable + refused (to resolve) + waived
--   patient receivable  = amount - third_party_amount - amount_paid
--   organism receivable = sum over open claims of (claimed - received - rejected)

-- ============================================================ 1. rejection ledger
alter table public.insurance_claims add constraint insurance_claims_id_clinic_key unique (id, clinic_id);

create table public.insurance_claim_rejections (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.cabinets(id) on delete cascade,
  claim_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) > 0),
  rejected_at timestamptz not null default now(),
  created_by uuid,
  -- explicit decision on the refused amount; null = still to resolve
  resolution text check (resolution in ('REFILED', 'TRANSFERRED_TO_PATIENT', 'WAIVED')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  refiled_claim_id uuid unique,
  constraint insurance_claim_rejections_claim_fkey
    foreign key (claim_id, clinic_id) references public.insurance_claims(id, clinic_id),
  constraint insurance_claim_rejections_resolved_check
    check ((resolution is null) = (resolved_at is null)),
  constraint insurance_claim_rejections_refile_check
    check (refiled_claim_id is null or resolution = 'REFILED')
);
create index insurance_claim_rejections_claim on public.insurance_claim_rejections (claim_id);

alter table public.insurance_claim_rejections enable row level security;
create policy insurance_claim_rejections_select on public.insurance_claim_rejections for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
create policy insurance_claim_rejections_view_permission_gate on public.insurance_claim_rejections as restrictive for select
  using (public.is_admin() or public.mm_has_permission('billing.view'));
create policy insurance_claim_rejections_no_direct_write on public.insurance_claim_rejections for all using (false) with check (false);
revoke all on public.insurance_claim_rejections from anon;
revoke insert, update, delete, truncate on public.insurance_claim_rejections from authenticated;
grant select on public.insurance_claim_rejections to authenticated;
grant all on public.insurance_claim_rejections to service_role;

-- re-filings point to the rejection they come from
alter table public.insurance_claims
  add column source_rejection_id uuid references public.insurance_claim_rejections(id);

-- ---------------------------------------------------------------- carry stage-2 rejections over
insert into public.insurance_claim_rejections (
  clinic_id, claim_id, amount, reason, rejected_at, resolution, resolution_note, resolved_at, resolved_by, refiled_claim_id
)
select c.clinic_id, c.id, c.amount_rejected, coalesce(nullif(btrim(c.rejection_reason), ''), 'Motif non renseigné (reprise)'),
       c.updated_at, c.rejection_resolution,
       case when c.rejection_resolution = 'REFILED' then null else c.resolution_note end,
       c.resolved_at, c.resolved_by,
       (select n.id from public.insurance_claims n where n.previous_claim_id = c.id limit 1)
from public.insurance_claims c
where c.amount_rejected > 0;

update public.insurance_claims n
set source_rejection_id = r.id
from public.insurance_claim_rejections r
where r.refiled_claim_id = n.id;

-- ============================================================ 2. claim constraints
-- The invoice-level assumptions go: one open claim per invoice, and "claimed + patient share =
-- invoice" (only true with a single claim). patient_share stays as a snapshot: what was left to
-- the patient when the claim was created.
drop index if exists public.insurance_claims_one_open_per_invoice;
drop index if exists public.insurance_claims_one_refile;
alter table public.insurance_claims drop constraint if exists insurance_claims_split_check;
alter table public.insurance_claims drop constraint if exists insurance_claims_resolution_check;
alter table public.insurance_claims drop column rejection_resolution;
alter table public.insurance_claims drop column resolution_note;
alter table public.insurance_claims drop column resolved_at;
alter table public.insurance_claims drop column resolved_by;

-- one live ORIGINAL claim per invoice and organization (double click safe) ...
create unique index insurance_claims_one_per_invoice_organization
  on public.insurance_claims (invoice_id, organization_id)
  where previous_claim_id is null and status <> 'CANCELLED';
-- ... and one re-filing per rejection
create unique index insurance_claims_one_refile_per_rejection
  on public.insurance_claims (source_rejection_id) where source_rejection_id is not null;
alter table public.insurance_claims add constraint insurance_claims_refile_link_check
  check ((previous_claim_id is null) = (source_rejection_id is null));

-- Context stays immutable; received / rejected can only be the ledgers' sums; closed claims
-- (settled, rejected, cancelled) no longer move.
create or replace function public.mm_insurance_claims_immutable_context()
returns trigger
language plpgsql
as $$
begin
  if (new.clinic_id, new.patient_id, new.invoice_id, new.visit_id, new.coverage_id, new.organization_id,
      new.claim_type, new.invoice_amount, new.amount_claimed, new.patient_share,
      new.coverage_type_snapshot, new.organization_name_snapshot, new.membership_number_snapshot,
      new.beneficiary_type_snapshot, new.created_at, new.created_by, new.previous_claim_id, new.source_rejection_id)
     is distinct from
     (old.clinic_id, old.patient_id, old.invoice_id, old.visit_id, old.coverage_id, old.organization_id,
      old.claim_type, old.invoice_amount, old.amount_claimed, old.patient_share,
      old.coverage_type_snapshot, old.organization_name_snapshot, old.membership_number_snapshot,
      old.beneficiary_type_snapshot, old.created_at, old.created_by, old.previous_claim_id, old.source_rejection_id) then
    raise exception 'claim context is immutable';
  end if;
  if new.amount_received is distinct from old.amount_received
     and new.amount_received <> coalesce((select sum(amount) from public.insurance_settlements where claim_id = new.id), 0) then
    raise exception 'amount_received is derived from insurance_settlements';
  end if;
  if new.amount_rejected is distinct from old.amount_rejected
     and new.amount_rejected <> coalesce((select sum(amount) from public.insurance_claim_rejections where claim_id = new.id), 0) then
    raise exception 'amount_rejected is derived from insurance_claim_rejections';
  end if;
  if old.status in ('SETTLED', 'CANCELLED', 'REJECTED')
     and (new.status, new.amount_received, new.amount_rejected, new.rejection_reason, new.external_reference, new.submitted_at, new.received_at)
         is distinct from (old.status, old.amount_received, old.amount_rejected, old.rejection_reason, old.external_reference, old.submitted_at, old.received_at) then
    raise exception 'claim is closed';
  end if;
  return new;
end;
$$;

-- ============================================================ 3. rejection ledger triggers
-- A rejection row is fixed; only its resolution is written, once (plus the re-filed claim link).
create or replace function public.mm_claim_rejections_guard_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then raise exception 'claim rejections are immutable'; end if;
  if (new.id, new.clinic_id, new.claim_id, new.amount, new.reason, new.rejected_at, new.created_by)
     is distinct from (old.id, old.clinic_id, old.claim_id, old.amount, old.reason, old.rejected_at, old.created_by) then
    raise exception 'claim rejections are immutable';
  end if;
  if old.resolution is not null
     and ((new.resolution, new.resolution_note, new.resolved_at, new.resolved_by)
          is distinct from (old.resolution, old.resolution_note, old.resolved_at, old.resolved_by)
          or (old.refiled_claim_id is not null and new.refiled_claim_id is distinct from old.refiled_claim_id)) then
    raise exception 'rejection already resolved';
  end if;
  return new;
end;
$$;
create trigger trg_claim_rejections_guard
  before update or delete on public.insurance_claim_rejections
  for each row execute function public.mm_claim_rejections_guard_update();

-- Before insert: the claim must still be awaiting the organism, and the refusal can never exceed
-- what is still outstanding. The claim row is locked (same lock as settlements).
create or replace function public.mm_claim_rejections_before_insert()
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
    raise exception 'claim must be submitted before a rejection';
  end if;
  v_open := v_claim.amount_claimed
    - coalesce((select sum(amount) from public.insurance_settlements where claim_id = new.claim_id), 0)
    - coalesce((select sum(amount) from public.insurance_claim_rejections where claim_id = new.claim_id), 0);
  if new.amount > v_open then
    raise exception 'rejection % exceeds the outstanding amount %', new.amount, v_open;
  end if;
  return new;
end;
$$;
create trigger trg_claim_rejections_before_insert
  before insert on public.insurance_claim_rejections
  for each row execute function public.mm_claim_rejections_before_insert();

create or replace function public.mm_claim_rejections_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rejected numeric;
begin
  select coalesce(sum(amount), 0) into v_rejected from public.insurance_claim_rejections where claim_id = new.claim_id;
  update public.insurance_claims
  set amount_rejected = v_rejected,
      rejection_reason = new.reason,
      status = public.mm_claim_status_for_amounts(status, amount_claimed, amount_received, v_rejected),
      updated_at = now()
  where id = new.claim_id;
  return null;
end;
$$;
create trigger trg_claim_rejections_after_insert
  after insert on public.insurance_claim_rejections
  for each row execute function public.mm_claim_rejections_after_insert();

-- ============================================================ 4. derived third-party share
-- What an organism is (still) responsible for on its claim.
create or replace function public.mm_claim_allocation(p_claim_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case when c.status = 'CANCELLED' then 0
              else c.amount_claimed - coalesce((
                select sum(r.amount) from public.insurance_claim_rejections r
                where r.claim_id = c.id and r.resolution in ('REFILED', 'TRANSFERRED_TO_PATIENT')), 0)
         end
  from public.insurance_claims c where c.id = p_claim_id
$$;

-- Recomputes the invoice's third-party share from its claims. The payments check
-- (amount_paid + third_party_amount <= amount) refuses any over-allocation. The patient side is
-- re-opened or closed accordingly (the visit itself is closed by create_insurance_claim).
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
exception when check_violation then
  raise exception 'claims exceed what is still unpaid on the invoice';
end;
$$;
revoke all on function public.mm_sync_invoice_third_party(uuid) from public, anon, authenticated;
revoke all on function public.mm_claim_allocation(uuid) from public, anon, authenticated;

create or replace function public.mm_claims_sync_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mm_sync_invoice_third_party(new.invoice_id);
  return null;
end;
$$;
create trigger trg_claims_sync_invoice
  after insert or update of status, amount_claimed on public.insurance_claims
  for each row execute function public.mm_claims_sync_invoice();

create or replace function public.mm_rejections_sync_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mm_sync_invoice_third_party((select invoice_id from public.insurance_claims where id = new.claim_id));
  return null;
end;
$$;
create trigger trg_rejections_sync_invoice
  after update of resolution on public.insurance_claim_rejections
  for each row execute function public.mm_rejections_sync_invoice();

-- Bring every invoice with claims in line with the derived value.
do $$
declare v uuid;
begin
  for v in select distinct invoice_id from public.insurance_claims loop
    perform public.mm_sync_invoice_third_party(v);
  end loop;
end $$;

-- ============================================================ 5. RPCs
drop function if exists public.refile_insurance_claim(uuid, uuid, text);
drop function if exists public.transfer_rejection_to_patient(uuid, text);
drop function if exists public.waive_rejected_amount(uuid, text);
drop function if exists public.mm_lock_unresolved_rejection(uuid);

-- Opens a claim on an invoice for one of the patient's coverages. Several claims can share an
-- invoice (one per organization); the invoice's third-party share is derived from them, and the
-- database refuses a total above what the patient has not paid yet.
create or replace function public.create_insurance_claim(
  p_invoice_id uuid,
  p_coverage_id uuid,
  p_amount_claimed numeric,
  p_status text default 'READY',
  p_notes text default null
)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_visit public.visits;
  v_cov public.patient_coverages;
  v_org public.insurance_organizations;
  v_claim public.insurance_claims;
  v_available numeric;
begin
  perform public.mm_assert_permission('billing.collect');
  if p_status not in ('DRAFT', 'READY') then raise exception 'a new claim starts as DRAFT or READY'; end if;

  select * into v_pay from public.payments where id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  perform public.mm_assert_same_clinic(v_pay.clinic_id);
  if v_pay.status <> 'pending' then raise exception 'invoice is not open (status %)', v_pay.status; end if;
  if v_pay.visit_id is null then raise exception 'invoice is not linked to a visit'; end if;
  select * into v_visit from public.visits where id = v_pay.visit_id;
  if not found or v_visit.status = 'cancelled' then raise exception 'visit is cancelled'; end if;

  select * into v_cov from public.patient_coverages where id = p_coverage_id;
  if not found then raise exception 'coverage not found'; end if;
  perform public.mm_assert_same_clinic(v_cov.clinic_id);
  if v_cov.patient_id <> v_pay.patient_id then raise exception 'coverage belongs to another patient'; end if;
  if not v_cov.is_active or v_cov.coverage_type = 'NONE' then raise exception 'coverage is not active'; end if;
  if (v_cov.valid_from is not null and v_cov.valid_from > current_date)
     or (v_cov.valid_until is not null and v_cov.valid_until < current_date) then
    raise exception 'coverage is not valid today';
  end if;
  select * into v_org from public.insurance_organizations where id = v_cov.organization_id;
  if not v_org.is_active then raise exception 'organization is inactive'; end if;

  if exists (select 1 from public.insurance_claims where invoice_id = p_invoice_id and organization_id = v_org.id
             and previous_claim_id is null and status <> 'CANCELLED') then
    raise exception 'a claim already exists for this invoice and organization';
  end if;

  v_available := v_pay.amount - v_pay.amount_paid - v_pay.third_party_amount;
  if p_amount_claimed is null or p_amount_claimed <= 0 then raise exception 'amount claimed must be positive'; end if;
  if p_amount_claimed > v_available then
    raise exception 'amount claimed % exceeds what is still unpaid on the invoice (%)', p_amount_claimed, v_available;
  end if;

  begin
    insert into public.insurance_claims (
      clinic_id, invoice_id, visit_id, patient_id, coverage_id, organization_id, claim_type, status,
      invoice_amount, amount_claimed, patient_share, notes, created_by,
      coverage_type_snapshot, organization_name_snapshot, membership_number_snapshot, beneficiary_type_snapshot
    ) values (
      v_pay.clinic_id, v_pay.id, v_pay.visit_id, v_pay.patient_id, v_cov.id, v_org.id, 'TIERS_PAYANT', p_status,
      v_pay.amount, p_amount_claimed, v_pay.amount - v_pay.third_party_amount - p_amount_claimed, nullif(btrim(p_notes), ''), auth.uid(),
      v_cov.coverage_type, v_org.name, v_cov.membership_number, v_cov.beneficiary_type
    ) returning * into v_claim;
  exception when unique_violation then
    -- two clicks at the same moment: the partial unique index keeps a single claim
    raise exception 'a claim already exists for this invoice and organization';
  end;

  -- the trigger derived the invoice's third-party share; if the patient owes nothing now and the
  -- visit is still at the cashier, close it the way a full payment would
  select * into v_pay from public.payments where id = p_invoice_id;
  if v_pay.status = 'paid' and v_visit.status = 'billing' then
    update public.visits set status = 'completed', completed_at = now(), updated_by = auth.uid(), updated_at = now()
    where id = v_visit.id;
    update public.consultations set statut = 'paye', updated_at = now() where id = v_pay.consultation_id;
    if v_visit.rdv_id is not null then
      update public.rdv set status = 'completed', payment_status = 'PAID'
      where id = v_visit.rdv_id and cabinet_id = v_visit.clinic_id;
    end if;
  end if;

  perform public.write_audit_log('INSURANCE_CLAIM_CREATED', 'insurance_claim', v_claim.id, null, to_jsonb(v_claim),
    jsonb_build_object('invoice_id', v_pay.id, 'amount', p_amount_claimed, 'organization', v_org.name,
                       'third_party_amount_after', v_pay.third_party_amount));
  return v_claim;
end;
$$;

-- Money received: unchanged from stage 2 except the audit now says whether the claim is fully or
-- partially settled after it.
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
  v_after public.insurance_claims;
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
    select * into v_row from public.insurance_settlements
    where clinic_id = v_claim.clinic_id and idempotency_key = p_idempotency_key;
    return v_row;
  end;

  select * into v_after from public.insurance_claims where id = v_claim.id;
  perform public.write_audit_log(
    case when v_after.status = 'SETTLED' then 'INSURANCE_SETTLEMENT_RECEIVED' else 'INSURANCE_PARTIAL_SETTLEMENT_RECEIVED' end,
    'insurance_claim', v_claim.id, to_jsonb(v_claim), to_jsonb(v_after),
    jsonb_build_object('settlement_id', v_row.id, 'amount', v_row.amount, 'method', v_row.payment_method,
                       'reference', v_row.reference, 'invoice_id', v_claim.invoice_id, 'organization', v_claim.organization_name_snapshot,
                       'claim_status_after', v_after.status,
                       'outstanding_after', v_after.amount_claimed - v_after.amount_received - v_after.amount_rejected));
  return v_row;
end;
$$;

-- The organism refuses (part of) what it still owes. Default: all of it. Each refusal is a ledger
-- row waiting for its own explicit resolution.
create or replace function public.reject_insurance_claim(p_claim_id uuid, p_reason text, p_amount numeric default null)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
  v_row public.insurance_claim_rejections;
  v_amount numeric;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);
  if nullif(btrim(p_reason), '') is null then raise exception 'a rejection reason is required'; end if;
  v_amount := coalesce(p_amount, v_before.amount_claimed - v_before.amount_received - v_before.amount_rejected);
  if v_amount is null or v_amount <= 0 then raise exception 'rejection % exceeds the outstanding amount', v_amount; end if;

  insert into public.insurance_claim_rejections (clinic_id, claim_id, amount, reason, created_by)
  values (v_before.clinic_id, v_before.id, v_amount, btrim(p_reason), auth.uid())
  returning * into v_row;

  select * into v_after from public.insurance_claims where id = p_claim_id;
  perform public.write_audit_log('INSURANCE_CLAIM_REJECTED', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('rejection_id', v_row.id, 'amount', v_amount, 'reason', v_row.reason, 'invoice_id', v_before.invoice_id,
                       'claim_status_after', v_after.status));
  return v_after;
end;
$$;

-- Shared checks for the three resolutions of one refusal.
create or replace function public.mm_lock_unresolved_rejection(p_rejection_id uuid)
returns public.insurance_claim_rejections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rej public.insurance_claim_rejections;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_rej from public.insurance_claim_rejections where id = p_rejection_id for update;
  if not found then raise exception 'rejection not found'; end if;
  perform public.mm_assert_same_clinic(v_rej.clinic_id);
  if v_rej.resolution is not null then raise exception 'rejection already resolved'; end if;
  return v_rej;
end;
$$;
revoke all on function public.mm_lock_unresolved_rejection(uuid) from public, anon, authenticated;

-- Resolution 1: re-file. A NEW claim (READY) for the refused amount on the same invoice, linked to
-- the claim and the refusal it comes from. The refused amount moves to the new claim, so it stops
-- counting on the old one; the invoice's third-party share is unchanged. Nothing is duplicated.
create or replace function public.refile_insurance_claim(p_rejection_id uuid, p_coverage_id uuid default null, p_notes text default null)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rej public.insurance_claim_rejections;
  v_old public.insurance_claims;
  v_pay public.payments;
  v_cov public.patient_coverages;
  v_org public.insurance_organizations;
  v_new public.insurance_claims;
begin
  v_rej := public.mm_lock_unresolved_rejection(p_rejection_id);
  select * into v_old from public.insurance_claims where id = v_rej.claim_id;

  select * into v_pay from public.payments where id = v_old.invoice_id for update;
  if v_pay.status not in ('pending', 'paid') then raise exception 'invoice is not open (status %)', v_pay.status; end if;

  select * into v_cov from public.patient_coverages where id = coalesce(p_coverage_id, v_old.coverage_id);
  if not found then raise exception 'coverage not found'; end if;
  perform public.mm_assert_same_clinic(v_cov.clinic_id);
  if v_cov.patient_id <> v_old.patient_id then raise exception 'coverage belongs to another patient'; end if;
  if not v_cov.is_active or v_cov.coverage_type = 'NONE' then raise exception 'coverage is not active'; end if;
  select * into v_org from public.insurance_organizations where id = v_cov.organization_id;
  if not v_org.is_active then raise exception 'organization is inactive'; end if;

  -- the refusal leaves the old claim first, then the new claim takes it: the invoice's share never
  -- goes above its real value in between
  update public.insurance_claim_rejections
  set resolution = 'REFILED', resolved_at = now(), resolved_by = auth.uid(), resolution_note = nullif(btrim(p_notes), '')
  where id = v_rej.id;

  begin
    insert into public.insurance_claims (
      clinic_id, invoice_id, visit_id, patient_id, coverage_id, organization_id, claim_type, status,
      invoice_amount, amount_claimed, patient_share, notes, created_by, previous_claim_id, source_rejection_id,
      coverage_type_snapshot, organization_name_snapshot, membership_number_snapshot, beneficiary_type_snapshot
    ) values (
      v_old.clinic_id, v_old.invoice_id, v_old.visit_id, v_old.patient_id, v_cov.id, v_org.id, 'TIERS_PAYANT', 'READY',
      v_pay.amount, v_rej.amount, v_pay.amount - v_pay.third_party_amount,
      coalesce(nullif(btrim(p_notes), ''), 'Redépôt du rejet : ' || v_rej.reason), auth.uid(), v_old.id, v_rej.id,
      v_cov.coverage_type, v_org.name, v_cov.membership_number, v_cov.beneficiary_type
    ) returning * into v_new;
  exception when unique_violation then
    raise exception 'rejection already resolved';
  end;

  update public.insurance_claim_rejections set refiled_claim_id = v_new.id where id = v_rej.id;

  perform public.write_audit_log('INSURANCE_CLAIM_REFILED', 'insurance_claim', v_new.id, to_jsonb(v_old), to_jsonb(v_new),
    jsonb_build_object('previous_claim_id', v_old.id, 'rejection_id', v_rej.id, 'amount', v_rej.amount,
                       'rejection_reason', v_rej.reason, 'invoice_id', v_old.invoice_id));
  return v_new;
end;
$$;

-- Resolution 2: the refused amount becomes the patient's, on the same invoice. The invoice's
-- third-party share goes down by that amount (derived), so the patient's balance goes up; no
-- payment and no invoice are created.
create or replace function public.transfer_rejection_to_patient(p_rejection_id uuid, p_note text default null)
returns public.insurance_claim_rejections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rej public.insurance_claim_rejections;
  v_claim public.insurance_claims;
  v_before public.payments;
  v_after public.payments;
begin
  v_rej := public.mm_lock_unresolved_rejection(p_rejection_id);
  select * into v_claim from public.insurance_claims where id = v_rej.claim_id;
  select * into v_before from public.payments where id = v_claim.invoice_id for update;
  if v_before.status not in ('pending', 'paid') then raise exception 'invoice is not open (status %)', v_before.status; end if;

  update public.insurance_claim_rejections
  set resolution = 'TRANSFERRED_TO_PATIENT', resolved_at = now(), resolved_by = auth.uid(), resolution_note = nullif(btrim(p_note), '')
  where id = v_rej.id
  returning * into v_rej;

  select * into v_after from public.payments where id = v_claim.invoice_id;
  perform public.write_audit_log('INSURANCE_REJECTION_TRANSFERRED_TO_PATIENT', 'insurance_claim', v_claim.id, null, to_jsonb(v_rej),
    jsonb_build_object('rejection_id', v_rej.id, 'amount', v_rej.amount, 'invoice_id', v_claim.invoice_id,
                       'patient_due_before', v_before.amount - v_before.third_party_amount - v_before.amount_paid,
                       'patient_due_after', v_after.amount - v_after.third_party_amount - v_after.amount_paid));
  return v_rej;
end;
$$;

-- Resolution 3: abandon / exonerate the refused amount: owed by nobody, never counted as received.
create or replace function public.waive_rejected_amount(p_rejection_id uuid, p_reason text)
returns public.insurance_claim_rejections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rej public.insurance_claim_rejections;
  v_claim public.insurance_claims;
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'a waiver reason is required'; end if;
  v_rej := public.mm_lock_unresolved_rejection(p_rejection_id);
  select * into v_claim from public.insurance_claims where id = v_rej.claim_id;

  update public.insurance_claim_rejections
  set resolution = 'WAIVED', resolved_at = now(), resolved_by = auth.uid(), resolution_note = btrim(p_reason)
  where id = v_rej.id
  returning * into v_rej;

  perform public.write_audit_log('INSURANCE_REJECTION_WAIVED', 'insurance_claim', v_claim.id, null, to_jsonb(v_rej),
    jsonb_build_object('rejection_id', v_rej.id, 'amount', v_rej.amount, 'reason', v_rej.resolution_note, 'invoice_id', v_claim.invoice_id));
  return v_rej;
end;
$$;

-- Lifecycle moves without money. Cancelling is only possible before any receipt or refusal; the
-- invoice's third-party share is then re-derived (the claim's amount returns to the patient).
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

  perform public.write_audit_log(
    case p_status when 'SUBMITTED' then 'INSURANCE_CLAIM_SUBMITTED' when 'CANCELLED' then 'INSURANCE_CLAIM_CANCELLED' else 'INSURANCE_CLAIM_STATUS' end,
    'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('from', v_before.status, 'to', p_status, 'amount', v_before.amount_claimed, 'invoice_id', v_before.invoice_id));
  return v_after;
end;
$$;

-- ---------------------------------------------------------------- grants
revoke all on function public.mm_claim_rejections_guard_update() from public, anon, authenticated;
revoke all on function public.mm_claim_rejections_before_insert() from public, anon, authenticated;
revoke all on function public.mm_claim_rejections_after_insert() from public, anon, authenticated;
revoke all on function public.mm_claims_sync_invoice() from public, anon, authenticated;
revoke all on function public.mm_rejections_sync_invoice() from public, anon, authenticated;
revoke all on function public.create_insurance_claim(uuid, uuid, numeric, text, text) from public, anon;
revoke all on function public.record_insurance_settlement(uuid, numeric, text, timestamptz, text, text, uuid) from public, anon;
revoke all on function public.reject_insurance_claim(uuid, text, numeric) from public, anon;
revoke all on function public.refile_insurance_claim(uuid, uuid, text) from public, anon;
revoke all on function public.transfer_rejection_to_patient(uuid, text) from public, anon;
revoke all on function public.waive_rejected_amount(uuid, text) from public, anon;
revoke all on function public.update_claim_status(uuid, text, text, text) from public, anon;
grant execute on function public.create_insurance_claim(uuid, uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.record_insurance_settlement(uuid, numeric, text, timestamptz, text, text, uuid) to authenticated, service_role;
grant execute on function public.reject_insurance_claim(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.refile_insurance_claim(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.transfer_rejection_to_patient(uuid, text) to authenticated, service_role;
grant execute on function public.waive_rejected_amount(uuid, text) to authenticated, service_role;
grant execute on function public.update_claim_status(uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
