-- Tiers payant foundation: coverage -> organization -> payment mode -> claim.
--
-- Replaces the first tiers-payant model (20260922000000_tiers_payant.sql), which mixed three
-- different things: patient reimbursement, tiers payant and prise en charge. It also booked the
-- organism's money as if the patient had paid it, and hard-coded a coverage percentage.
--
-- Business model after this migration
--   PATIENT mode (default)   the patient pays the whole invoice. Any later reimbursement from the
--                            patient's AMO / mutuelle is between the patient and the organism:
--                            nothing is owed to the cabinet, no claim exists.
--   TIERS_PAYANT mode        the organism pays the cabinet directly for its share
--                            (payments.third_party_amount). The patient pays only the rest. The
--                            organism's share is a cabinet receivable tracked by an insurance_claim.
--   Prise en charge          (prior authorization) is a separate concept and is NOT modelled here.
--
-- Money stays in the existing tables:
--   payments.amount               billed total (unchanged meaning)
--   payments.third_party_amount   share the organism pays the cabinet (0 in PATIENT mode)
--   payments.amount_paid          collected FROM THE PATIENT only
--   patient share                 = amount - third_party_amount
--   payments.status 'paid'        the patient's side is settled. The organism may still owe its
--                                 share: that lives on the claim, not on the invoice status.
--   insurance_claims              the organism's side: amount_claimed / amount_received /
--                                 amount_rejected, with its own status lifecycle.
--
-- No reimbursement rate, tariff or percentage is stored or computed. The organism's share is
-- entered by the user from the applicable rules. The managing organization is a clinic-configured
-- row, never an enum (the AMO management structure is changing).
--
-- Existing objects are evolved in place, not duplicated:
--   insurers           -> renamed insurance_organizations (+ organization_type, contact fields)
--   patients.insurer_id / coverage_rate -> moved into the new patient_coverages table, then dropped
--   insurance_claims   -> columns renamed to the claim vocabulary, new status set, snapshot columns
-- Every write goes through a SECURITY DEFINER RPC scoped to the caller's clinic. No direct table
-- writes, and anon has no access.

-- ============================================================ 0. drop the old RPCs
-- Their signatures and semantics (rates, 'insurance' collections) no longer exist.
drop function if exists public.upsert_insurer(uuid, text, text, numeric);
drop function if exists public.set_patient_coverage(uuid, uuid, numeric);
drop function if exists public.create_insurance_claim(uuid, uuid, numeric);
drop function if exists public.update_claim_status(uuid, text, text, text);
drop function if exists public.record_claim_reimbursement(uuid, numeric, text);

-- ============================================================ 1. organization directory
alter table public.insurers rename to insurance_organizations;
alter index if exists public.insurers_clinic_name_uniq rename to insurance_organizations_clinic_name_uniq;

alter table public.insurance_organizations
  add column if not exists organization_type text,
  add column if not exists code text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Old kind -> new type. CNSS and CNOPS were modelled as kinds; they become plain organizations of
-- type AMO_MANAGER, keeping their name.
update public.insurance_organizations
set organization_type = case kind
  when 'cnss' then 'AMO_MANAGER'
  when 'cnops' then 'AMO_MANAGER'
  when 'mutuelle' then 'MUTUELLE'
  when 'prive' then 'PRIVATE_INSURER'
  else 'OTHER'
end
where organization_type is null;

alter table public.insurance_organizations
  alter column organization_type set not null,
  alter column organization_type set default 'OTHER',
  add constraint insurance_organizations_type_check
    check (organization_type in ('AMO_MANAGER', 'MUTUELLE', 'PRIVATE_INSURER', 'OTHER'));

-- The old kind is still needed below to map legacy coverages; it is dropped at the end.

alter table public.insurance_organizations
  drop constraint if exists insurers_clinic_id_fkey,
  add constraint insurance_organizations_clinic_id_fkey
    foreign key (clinic_id) references public.cabinets(id) on delete cascade;
-- Target of the composite (id, clinic_id) foreign keys below: a row can only point to an
-- organization of its own clinic.
alter table public.insurance_organizations
  add constraint insurance_organizations_id_clinic_key unique (id, clinic_id);

alter policy insurers_select on public.insurance_organizations rename to insurance_organizations_select;
alter policy insurers_no_direct_write on public.insurance_organizations rename to insurance_organizations_no_direct_write;

-- ============================================================ 2. same-clinic targets on existing tables
-- Unique keys that let composite foreign keys prove "same clinic" (and "same patient").
alter table public.patients add constraint patients_id_cabinet_key unique (id, cabinet_id);
alter table public.visits add constraint visits_id_clinic_key unique (id, clinic_id);
alter table public.payments add constraint payments_id_clinic_patient_key unique (id, clinic_id, patient_id);

-- ============================================================ 3. patient coverage
create table public.patient_coverages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.cabinets(id) on delete cascade,
  patient_id uuid not null,
  coverage_type text not null check (coverage_type in ('AMO', 'COMPLEMENTARY', 'PRIVATE_INSURANCE', 'NONE')),
  organization_id uuid,
  membership_number text,
  beneficiary_type text not null default 'UNKNOWN' check (beneficiary_type in ('ASSURE', 'AYANT_DROIT', 'UNKNOWN')),
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_coverages_patient_fkey
    foreign key (patient_id, clinic_id) references public.patients(id, cabinet_id) on delete cascade,
  constraint patient_coverages_organization_fkey
    foreign key (organization_id, clinic_id) references public.insurance_organizations(id, clinic_id),
  -- a real coverage names its organization; NONE ("no coverage declared") names none
  constraint patient_coverages_organization_check
    check ((coverage_type = 'NONE') = (organization_id is null)),
  constraint patient_coverages_validity_check
    check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint patient_coverages_id_clinic_patient_key unique (id, clinic_id, patient_id)
);
-- one active coverage per kind (one AMO, one complementary...) per patient
create unique index patient_coverages_one_active_per_type
  on public.patient_coverages (patient_id, coverage_type) where is_active;
create index patient_coverages_clinic_patient on public.patient_coverages (clinic_id, patient_id);
create index patient_coverages_organization on public.patient_coverages (organization_id);

alter table public.patient_coverages enable row level security;

create policy patient_coverages_select on public.patient_coverages for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
create policy patient_coverages_view_permission_gate on public.patient_coverages as restrictive for select
  using (public.is_admin() or public.mm_has_permission('patients.view'));
create policy patient_coverages_no_direct_write on public.patient_coverages for all using (false) with check (false);

-- Legacy coverage: patients.insurer_id (+ numero_cnss as the membership number for AMO), and
-- every (patient, organization) pair used by an existing claim so those claims can point to it.
insert into public.patient_coverages (clinic_id, patient_id, coverage_type, organization_id, membership_number, is_active, notes)
select distinct on (src.patient_id, src.organization_id)
  o.clinic_id,
  src.patient_id,
  case o.kind when 'cnss' then 'AMO' when 'cnops' then 'AMO' when 'mutuelle' then 'COMPLEMENTARY' else 'PRIVATE_INSURANCE' end,
  o.id,
  case when o.kind in ('cnss', 'cnops') then nullif(btrim(p.numero_cnss), '') end,
  false,
  'Reprise automatique de l''ancienne fiche assurance.'
from (
  select id as patient_id, insurer_id as organization_id from public.patients where insurer_id is not null
  union
  select patient_id, insurer_id from public.insurance_claims
) src
join public.insurance_organizations o on o.id = src.organization_id
join public.patients p on p.id = src.patient_id and p.cabinet_id = o.clinic_id;

-- The patient's current organization becomes the active coverage (one per coverage type).
update public.patient_coverages c
set is_active = true
from public.patients p
where p.id = c.patient_id and p.insurer_id = c.organization_id
  and not exists (
    select 1 from public.patient_coverages c2
    where c2.patient_id = c.patient_id and c2.coverage_type = c.coverage_type and c2.is_active
  );

-- ============================================================ 4. payment mode on the invoice
alter table public.payments
  add column payment_mode text not null default 'PATIENT',
  add column third_party_amount numeric(12,2) not null default 0,
  add constraint payments_payment_mode_check check (payment_mode in ('PATIENT', 'TIERS_PAYANT')),
  add constraint payments_third_party_amount_check check (
    third_party_amount >= 0
    and amount_paid + third_party_amount <= amount
    and ((payment_mode = 'PATIENT' and third_party_amount = 0) or (payment_mode = 'TIERS_PAYANT' and third_party_amount > 0))
  );

-- A 'paid' invoice means the PATIENT's share is collected. Before, this forced amount_paid up to
-- the full amount, which would book the organism's share as patient cash.
create or replace function public.mm_payments_sync_amount_paid()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and new.amount_paid < new.amount - coalesce(new.third_party_amount, 0) then
    new.amount_paid := new.amount - coalesce(new.third_party_amount, 0);
  end if;
  return new;
end;
$$;

-- ============================================================ 5. claims
alter table public.insurance_claims drop constraint if exists insurance_claims_payment_id_key;
alter table public.insurance_claims drop constraint if exists insurance_claims_payment_id_fkey;
alter table public.insurance_claims drop constraint if exists insurance_claims_insurer_id_fkey;
alter table public.insurance_claims drop constraint if exists insurance_claims_patient_id_fkey;
alter table public.insurance_claims drop constraint if exists insurance_claims_status_check;
alter table public.insurance_claims drop constraint if exists insurance_claims_check;
alter table public.insurance_claims drop constraint if exists insurance_claims_check1;
alter table public.insurance_claims drop constraint if exists insurance_claims_coverage_rate_check;
drop index if exists public.insurance_claims_insurer;

alter table public.insurance_claims rename column payment_id to invoice_id;
alter table public.insurance_claims rename column insurer_id to organization_id;
alter table public.insurance_claims rename column amount_total to invoice_amount;
alter table public.insurance_claims rename column amount_insurer to amount_claimed;
alter table public.insurance_claims rename column amount_patient to patient_share;
alter table public.insurance_claims rename column reimbursed_amount to amount_received;
alter table public.insurance_claims rename column reimbursed_at to received_at;
alter table public.insurance_claims rename column reference to external_reference;
alter table public.insurance_claims rename column note to notes;

alter table public.insurance_claims
  add column claim_type text not null default 'TIERS_PAYANT',
  add column coverage_id uuid,
  add column amount_rejected numeric(12,2) not null default 0,
  add column rejection_reason text,
  -- Snapshot of the coverage used for this billing event. Editing the patient's coverage later
  -- never rewrites these.
  add column coverage_type_snapshot text,
  add column organization_name_snapshot text,
  add column membership_number_snapshot text,
  add column beneficiary_type_snapshot text;

-- Legacy claims -> coverage + snapshot
update public.insurance_claims ic
set coverage_id = c.id,
    coverage_type_snapshot = c.coverage_type,
    organization_name_snapshot = o.name,
    membership_number_snapshot = c.membership_number,
    beneficiary_type_snapshot = c.beneficiary_type
from public.patient_coverages c
join public.insurance_organizations o on o.id = c.organization_id
where c.patient_id = ic.patient_id and c.organization_id = ic.organization_id;

-- Legacy status -> new lifecycle. Old reimbursements were already collected into
-- payments.amount_paid, so they stay counted there. Only what the organism still owes becomes
-- the invoice's third-party share.
update public.insurance_claims set status = case
  when amount_claimed <= 0 and status <> 'annule' then 'CANCELLED'
  when status = 'a_deposer' then 'READY'
  when status = 'depose' and amount_received > 0 then 'PARTIALLY_SETTLED'
  when status = 'depose' then 'SUBMITTED'
  when status = 'rembourse' then 'SETTLED'
  when status = 'rejete' and amount_received > 0 then 'SETTLED'
  when status = 'rejete' then 'REJECTED'
  else 'CANCELLED'
end;
update public.insurance_claims
set amount_rejected = amount_claimed - amount_received,
    rejection_reason = coalesce(nullif(btrim(notes), ''), 'Motif non renseigné (reprise)')
where status in ('REJECTED', 'SETTLED') and amount_received < amount_claimed;

update public.payments p
set payment_mode = 'TIERS_PAYANT',
    third_party_amount = least(ic.amount_claimed - ic.amount_received, p.amount - p.amount_paid)
from public.insurance_claims ic
where ic.invoice_id = p.id
  and ic.status in ('READY', 'SUBMITTED', 'PARTIALLY_SETTLED', 'REJECTED')
  and least(ic.amount_claimed - ic.amount_received, p.amount - p.amount_paid) > 0;
update public.payments
set status = 'paid'
where payment_mode = 'TIERS_PAYANT' and status = 'pending' and amount_paid + third_party_amount >= amount;

alter table public.insurance_claims
  drop column coverage_rate,
  alter column coverage_id set not null,
  alter column status set default 'DRAFT',
  alter column amount_claimed type numeric(12,2),
  alter column amount_received type numeric(12,2),
  alter column invoice_amount type numeric(12,2),
  alter column patient_share type numeric(12,2),
  add constraint insurance_claims_clinic_fkey
    foreign key (clinic_id) references public.cabinets(id) on delete cascade,
  add constraint insurance_claims_patient_fkey
    foreign key (patient_id, clinic_id) references public.patients(id, cabinet_id) on delete cascade,
  -- invoice of the same clinic AND the same patient. Deleting an invoice that carries a claim
  -- is refused (no silent loss of a receivable).
  add constraint insurance_claims_invoice_fkey
    foreign key (invoice_id, clinic_id, patient_id) references public.payments(id, clinic_id, patient_id),
  add constraint insurance_claims_visit_fkey
    foreign key (visit_id, clinic_id) references public.visits(id, clinic_id),
  -- coverage of the same clinic AND the same patient
  add constraint insurance_claims_coverage_fkey
    foreign key (coverage_id, clinic_id, patient_id) references public.patient_coverages(id, clinic_id, patient_id),
  add constraint insurance_claims_organization_fkey
    foreign key (organization_id, clinic_id) references public.insurance_organizations(id, clinic_id),
  add constraint insurance_claims_claim_type_check check (claim_type in ('TIERS_PAYANT')),
  add constraint insurance_claims_status_check check (status in (
    'DRAFT', 'READY', 'SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED', 'SETTLED', 'REJECTED', 'CANCELLED'
  )),
  add constraint insurance_claims_context_check check (invoice_id is not null or visit_id is not null),
  add constraint insurance_claims_amounts_check check (
    amount_claimed >= 0 and amount_received >= 0 and amount_rejected >= 0
    and amount_received + amount_rejected <= amount_claimed
    and (amount_claimed > 0 or status = 'CANCELLED')
  ),
  add constraint insurance_claims_split_check check (amount_claimed + patient_share = invoice_amount),
  -- the amounts must agree with the status
  add constraint insurance_claims_status_amounts_check check (case status
    when 'DRAFT' then amount_received = 0 and amount_rejected = 0
    when 'READY' then amount_received = 0 and amount_rejected = 0
    when 'SUBMITTED' then amount_received = 0 and amount_rejected = 0
    -- part of it may already be refused while the rest is still being examined
    when 'PROCESSING' then amount_received = 0 and amount_rejected < amount_claimed
    when 'PARTIALLY_SETTLED' then amount_received > 0 and amount_received + amount_rejected < amount_claimed
    when 'SETTLED' then amount_received > 0 and amount_received + amount_rejected = amount_claimed
    when 'REJECTED' then amount_received = 0 and amount_rejected = amount_claimed and rejection_reason is not null
    else true
  end);

-- one live claim per invoice (a cancelled one can be replaced)
create unique index insurance_claims_one_live_per_invoice
  on public.insurance_claims (invoice_id) where status <> 'CANCELLED';
create index insurance_claims_organization on public.insurance_claims (organization_id);
create index insurance_claims_patient on public.insurance_claims (clinic_id, patient_id);

-- The claim's context and snapshot are fixed once created. Only the lifecycle moves.
create or replace function public.mm_insurance_claims_immutable_context()
returns trigger
language plpgsql
as $$
begin
  if (new.clinic_id, new.patient_id, new.invoice_id, new.visit_id, new.coverage_id, new.organization_id,
      new.claim_type, new.invoice_amount, new.amount_claimed, new.patient_share,
      new.coverage_type_snapshot, new.organization_name_snapshot, new.membership_number_snapshot,
      new.beneficiary_type_snapshot, new.created_at, new.created_by)
     is distinct from
     (old.clinic_id, old.patient_id, old.invoice_id, old.visit_id, old.coverage_id, old.organization_id,
      old.claim_type, old.invoice_amount, old.amount_claimed, old.patient_share,
      old.coverage_type_snapshot, old.organization_name_snapshot, old.membership_number_snapshot,
      old.beneficiary_type_snapshot, old.created_at, old.created_by) then
    raise exception 'claim context is immutable';
  end if;
  if old.status in ('SETTLED', 'CANCELLED') and new is distinct from old then
    raise exception 'claim is closed';
  end if;
  return new;
end;
$$;
create trigger trg_insurance_claims_immutable_context
  before update on public.insurance_claims
  for each row execute function public.mm_insurance_claims_immutable_context();

-- ============================================================ 6. finish the organization / patient cleanup
alter table public.insurance_organizations drop column kind, drop column default_rate;
alter table public.patients drop column insurer_id, drop column coverage_rate;

-- ============================================================ 7. cancellation safety
-- An invoice or visit that is cancelled / refunded / waived can no longer carry a receivable.
-- Open claims are cancelled with it. If the organism already paid something, the cancellation
-- is refused: that money has to be dealt with first.
create or replace function public.mm_cancel_claims_for_context(p_invoice_id uuid, p_visit_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
begin
  -- settled or partly settled: the organism's money is real, the invoice cannot just disappear
  if exists (
    select 1 from public.insurance_claims
    where status <> 'CANCELLED' and amount_received > 0
      and ((p_invoice_id is not null and invoice_id = p_invoice_id) or (p_visit_id is not null and visit_id = p_visit_id))
  ) then
    raise exception 'an insurance claim on this invoice has already received a settlement';
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
      to_jsonb(v_claim), null, jsonb_build_object('reason', p_reason));
  end loop;
end;
$$;
revoke all on function public.mm_cancel_claims_for_context(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.mm_payments_cancel_claims()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'refunded', 'waived') and old.status is distinct from new.status then
    perform public.mm_cancel_claims_for_context(new.id, null, 'Facture ' || new.status || ' : dossier annulé automatiquement.');
  end if;
  return new;
end;
$$;
create trigger trg_payments_cancel_claims
  after update of status on public.payments
  for each row execute function public.mm_payments_cancel_claims();

create or replace function public.mm_visits_cancel_claims()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    perform public.mm_cancel_claims_for_context(null, new.id, 'Visite annulée : dossier annulé automatiquement.');
  end if;
  return new;
end;
$$;
create trigger trg_visits_cancel_claims
  after update of status on public.visits
  for each row execute function public.mm_visits_cancel_claims();

-- ============================================================ 8. grants: no anon, no direct writes
revoke all on public.insurance_organizations, public.patient_coverages, public.insurance_claims from anon;
revoke insert, update, delete, truncate on public.insurance_organizations, public.patient_coverages, public.insurance_claims from authenticated;
grant select on public.insurance_organizations, public.patient_coverages, public.insurance_claims to authenticated;
grant all on public.insurance_organizations, public.patient_coverages, public.insurance_claims to service_role;

-- ============================================================ 9. RPCs
-- ---------------------------------------------------------------- organizations
create or replace function public.upsert_insurance_organization(
  p_id uuid,
  p_name text,
  p_organization_type text,
  p_code text default null,
  p_contact_name text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_is_active boolean default true
)
returns public.insurance_organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_before public.insurance_organizations;
  v_row public.insurance_organizations;
begin
  perform public.mm_assert_permission('billing.collect');
  if v_clinic is null then raise exception 'no clinic for current user'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'organization name is required'; end if;

  if p_id is null then
    insert into public.insurance_organizations (clinic_id, name, organization_type, code, contact_name, phone, email, address, is_active)
    values (v_clinic, btrim(p_name), p_organization_type, nullif(btrim(p_code), ''), nullif(btrim(p_contact_name), ''),
            nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''), nullif(btrim(p_address), ''), coalesce(p_is_active, true))
    returning * into v_row;
  else
    select * into v_before from public.insurance_organizations where id = p_id for update;
    if not found then raise exception 'organization not found'; end if;
    perform public.mm_assert_same_clinic(v_before.clinic_id);
    update public.insurance_organizations
    set name = btrim(p_name), organization_type = p_organization_type, code = nullif(btrim(p_code), ''),
        contact_name = nullif(btrim(p_contact_name), ''), phone = nullif(btrim(p_phone), ''),
        email = nullif(btrim(p_email), ''), address = nullif(btrim(p_address), ''),
        is_active = coalesce(p_is_active, true), updated_at = now()
    where id = p_id
    returning * into v_row;
  end if;

  perform public.write_audit_log('INSURANCE_ORGANIZATION_SAVED', 'insurance_organization', v_row.id,
    case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_row), null);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------- patient coverage
-- Creates or edits a coverage. A coverage already used by a claim is never rewritten: editing
-- its organization / number / type / beneficiary closes it and creates a new version, so the
-- claim keeps the coverage it was billed under.
create or replace function public.upsert_patient_coverage(
  p_id uuid,
  p_patient_id uuid,
  p_coverage_type text,
  p_organization_id uuid,
  p_membership_number text default null,
  p_beneficiary_type text default 'UNKNOWN',
  p_valid_from date default null,
  p_valid_until date default null,
  p_is_active boolean default true,
  p_notes text default null
)
returns public.patient_coverages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient public.patients;
  v_org public.insurance_organizations;
  v_before public.patient_coverages;
  v_row public.patient_coverages;
  v_used boolean := false;
  v_membership text := nullif(btrim(p_membership_number), '');
begin
  perform public.mm_assert_permission('patients.update');

  select * into v_patient from public.patients where id = p_patient_id;
  if not found then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_patient.cabinet_id);

  if p_coverage_type <> 'NONE' then
    select * into v_org from public.insurance_organizations where id = p_organization_id;
    if not found then raise exception 'organization not found'; end if;
    perform public.mm_assert_same_clinic(v_org.clinic_id);
  elsif p_organization_id is not null then
    raise exception 'a NONE coverage has no organization';
  end if;

  if p_id is not null then
    select * into v_before from public.patient_coverages where id = p_id for update;
    if not found then raise exception 'coverage not found'; end if;
    perform public.mm_assert_same_clinic(v_before.clinic_id);
    if v_before.patient_id <> p_patient_id then raise exception 'coverage belongs to another patient'; end if;
    v_used := exists (select 1 from public.insurance_claims where coverage_id = p_id);
  end if;

  -- Only one active coverage per type. "No coverage" and a real coverage exclude each other.
  if coalesce(p_is_active, true) then
    update public.patient_coverages
    set is_active = false, updated_at = now()
    where patient_id = p_patient_id and is_active and id is distinct from p_id
      and (coverage_type = p_coverage_type
           or (p_coverage_type = 'NONE')
           or (coverage_type = 'NONE'));
  end if;

  if p_id is not null and v_used and (
       v_before.coverage_type, v_before.organization_id, v_before.membership_number, v_before.beneficiary_type
     ) is distinct from (p_coverage_type, p_organization_id, v_membership, coalesce(p_beneficiary_type, 'UNKNOWN')) then
    -- new version; the old one is closed and stays attached to its claims
    update public.patient_coverages
    set is_active = false,
        valid_until = coalesce(valid_until, greatest(current_date, coalesce(valid_from, current_date))),
        updated_at = now()
    where id = p_id;
    p_id := null;
  end if;

  if p_id is null then
    insert into public.patient_coverages (
      clinic_id, patient_id, coverage_type, organization_id, membership_number, beneficiary_type,
      valid_from, valid_until, is_active, notes, created_by
    ) values (
      v_patient.cabinet_id, p_patient_id, p_coverage_type, p_organization_id, v_membership,
      coalesce(p_beneficiary_type, 'UNKNOWN'), p_valid_from, p_valid_until, coalesce(p_is_active, true),
      nullif(btrim(p_notes), ''), auth.uid()
    ) returning * into v_row;
  else
    update public.patient_coverages
    set coverage_type = p_coverage_type, organization_id = p_organization_id, membership_number = v_membership,
        beneficiary_type = coalesce(p_beneficiary_type, 'UNKNOWN'), valid_from = p_valid_from,
        valid_until = p_valid_until, is_active = coalesce(p_is_active, true), notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where id = p_id
    returning * into v_row;
  end if;

  perform public.write_audit_log('PATIENT_COVERAGE_SAVED', 'patient_coverage', v_row.id,
    case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_row), null);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------- claims
-- Turns an invoice into a tiers-payant invoice and opens its dossier. The organism's share is
-- entered by the user (no rate is computed here). It can never exceed what the patient has not
-- paid yet. The invoice (payment row), its visit, the patient's coverage and the coverage's
-- organization must all be real, of the same clinic and the same patient.
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
  v_patient_open numeric;
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

  if exists (select 1 from public.insurance_claims where invoice_id = p_invoice_id and status <> 'CANCELLED') then
    raise exception 'a claim already exists for this invoice';
  end if;

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

  v_patient_open := v_pay.amount - v_pay.amount_paid;
  if p_amount_claimed is null or p_amount_claimed <= 0 then raise exception 'amount claimed must be positive'; end if;
  if p_amount_claimed > v_patient_open then
    raise exception 'amount claimed % exceeds what is still unpaid on the invoice (%)', p_amount_claimed, v_patient_open;
  end if;

  update public.payments
  set payment_mode = 'TIERS_PAYANT',
      third_party_amount = p_amount_claimed,
      -- nothing left for the patient: their side of the invoice is settled
      status = case when amount_paid + p_amount_claimed >= amount then 'paid' else status end,
      updated_at = now()
  where id = v_pay.id
  returning * into v_pay;

  insert into public.insurance_claims (
    clinic_id, invoice_id, visit_id, patient_id, coverage_id, organization_id, claim_type, status,
    invoice_amount, amount_claimed, patient_share, notes, created_by,
    coverage_type_snapshot, organization_name_snapshot, membership_number_snapshot, beneficiary_type_snapshot
  ) values (
    v_pay.clinic_id, v_pay.id, v_pay.visit_id, v_pay.patient_id, v_cov.id, v_org.id, 'TIERS_PAYANT', p_status,
    v_pay.amount, p_amount_claimed, v_pay.amount - p_amount_claimed, nullif(btrim(p_notes), ''), auth.uid(),
    v_cov.coverage_type, v_org.name, v_cov.membership_number, v_cov.beneficiary_type
  ) returning * into v_claim;

  -- If the patient owes nothing now and the visit is still at the cashier, close it the way a
  -- full payment would (process_visit_payment).
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
    jsonb_build_object('invoice_id', v_pay.id, 'third_party_amount', p_amount_claimed));
  return v_claim;
end;
$$;

-- Lifecycle moves that carry no money. Settlements and rejections go through
-- record_claim_settlement / reject_insurance_claim.
--   DRAFT -> READY | CANCELLED
--   READY -> DRAFT | SUBMITTED | CANCELLED
--   SUBMITTED -> PROCESSING | CANCELLED        PROCESSING -> CANCELLED
--   REJECTED -> READY (corrected, to be re-filed) | CANCELLED
-- Cancelling gives the organism's share back to the patient: the invoice returns to PATIENT
-- mode and is open again for that amount. Cancelling is refused once money was received.
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
    when 'REJECTED' then array['READY', 'CANCELLED']
    else array[]::text[]
  end;
  if not (p_status = any (v_allowed)) then
    raise exception 'invalid claim transition % -> %', v_before.status, p_status;
  end if;
  if p_status = 'CANCELLED' and v_before.amount_received > 0 then
    raise exception 'claim already received a settlement';
  end if;

  update public.insurance_claims
  set status = p_status,
      external_reference = coalesce(nullif(btrim(p_external_reference), ''), external_reference),
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      submitted_at = case when p_status = 'SUBMITTED' then now() else submitted_at end,
      -- re-filing a rejected claim: the amount is expected again
      amount_rejected = case when v_before.status = 'REJECTED' and p_status = 'READY' then 0 else amount_rejected end,
      rejection_reason = case when v_before.status = 'REJECTED' and p_status = 'READY' then null else rejection_reason end,
      updated_at = now()
  where id = p_claim_id
  returning * into v_after;

  if p_status = 'CANCELLED' then
    update public.payments
    set payment_mode = 'PATIENT', third_party_amount = 0,
        status = case when status = 'paid' and amount_paid < amount then 'pending' else status end,
        updated_at = now()
    where id = v_before.invoice_id and payment_mode = 'TIERS_PAYANT';
  end if;

  perform public.write_audit_log('INSURANCE_CLAIM_STATUS', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$$;

-- Records what the organism paid and/or refused on a filed claim. It can be called several
-- times (partial settlements). Status follows the amounts:
--   something still expected          -> PARTIALLY_SETTLED
--   nothing expected, something paid  -> SETTLED (any refused remainder stays in amount_rejected)
--   nothing expected, nothing paid    -> REJECTED
-- Money received from the organism is NOT added to payments.amount_paid: that column is the
-- patient's side only.
create or replace function public.record_claim_settlement(
  p_claim_id uuid,
  p_amount_received numeric,
  p_amount_rejected numeric default 0,
  p_rejection_reason text default null,
  p_external_reference text default null,
  p_received_at timestamptz default null
)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
  v_received numeric := coalesce(p_amount_received, 0);
  v_rejected numeric := coalesce(p_amount_rejected, 0);
  v_open numeric;
  v_new_received numeric;
  v_new_rejected numeric;
  v_status text;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);

  if v_before.status not in ('SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED') then
    raise exception 'claim must be submitted before a settlement';
  end if;
  if v_received < 0 or v_rejected < 0 or v_received + v_rejected <= 0 then
    raise exception 'invalid settlement amounts';
  end if;
  v_open := v_before.amount_claimed - v_before.amount_received - v_before.amount_rejected;
  if v_received + v_rejected > v_open then
    raise exception 'settlement % exceeds the outstanding amount %', v_received + v_rejected, v_open;
  end if;
  if v_rejected > 0 and nullif(btrim(p_rejection_reason), '') is null then
    raise exception 'a rejection reason is required';
  end if;

  v_new_received := v_before.amount_received + v_received;
  v_new_rejected := v_before.amount_rejected + v_rejected;
  v_status := case
    when v_new_received + v_new_rejected < v_before.amount_claimed then 'PARTIALLY_SETTLED'
    when v_new_received > 0 then 'SETTLED'
    else 'REJECTED'
  end;
  if v_status = 'PARTIALLY_SETTLED' and v_new_received = 0 then
    -- only part of the claim refused so far, nothing paid yet: still being processed
    v_status := 'PROCESSING';
  end if;

  update public.insurance_claims
  set amount_received = v_new_received,
      amount_rejected = v_new_rejected,
      rejection_reason = case when v_rejected > 0 then btrim(p_rejection_reason) else rejection_reason end,
      received_at = case when v_received > 0 then coalesce(p_received_at, now()) else received_at end,
      external_reference = coalesce(nullif(btrim(p_external_reference), ''), external_reference),
      status = v_status,
      updated_at = now()
  where id = p_claim_id
  returning * into v_after;

  perform public.write_audit_log('INSURANCE_CLAIM_SETTLEMENT', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('received', v_received, 'rejected', v_rejected));
  return v_after;
end;
$$;

-- The organism refuses everything still outstanding on the claim.
create or replace function public.reject_insurance_claim(p_claim_id uuid, p_reason text)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.insurance_claims;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_claim from public.insurance_claims where id = p_claim_id;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_claim.clinic_id);
  return public.record_claim_settlement(
    p_claim_id, 0, v_claim.amount_claimed - v_claim.amount_received - v_claim.amount_rejected, p_reason, null, null
  );
end;
$$;

-- ---------------------------------------------------------------- patient collection
-- Same as 20260923060000 except the patient can only be asked for their own share
-- (amount - third_party_amount), and 'insurance' is no longer a way to collect: an organism
-- pays through its tiers-payant claim.
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

  if p_method = 'insurance' then
    raise exception 'organism payments are recorded on the tiers payant claim';
  end if;
  if p_method not in ('cash', 'card', 'transfer', 'package', 'free') then
    raise exception 'invalid payment method';
  end if;

  select * into visit_before from public.visits where id = p_visit_id for update;
  if not found then raise exception 'visit not found'; end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

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

  v_remaining := payment_before.amount - payment_before.third_party_amount - payment_before.amount_paid;
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
    visit_after := visit_before;
    if v_full then
      update public.consultations set statut = 'paye', updated_at = now() where id = payment_after.consultation_id;
      if visit_after.rdv_id is not null then
        update public.rdv set payment_status = 'PAID'
        where id = visit_after.rdv_id and cabinet_id = visit_after.clinic_id;
      end if;
    end if;
  else
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
      'third_party', payment_after.third_party_amount,
      'collected', v_collect,
      'total_collected', payment_after.amount_paid,
      'remaining', payment_after.amount - payment_after.third_party_amount - payment_after.amount_paid,
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

-- ---------------------------------------------------------------- function grants
revoke all on function public.upsert_insurance_organization(uuid, text, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.upsert_patient_coverage(uuid, uuid, text, uuid, text, text, date, date, boolean, text) from public, anon;
revoke all on function public.create_insurance_claim(uuid, uuid, numeric, text, text) from public, anon;
revoke all on function public.update_claim_status(uuid, text, text, text) from public, anon;
revoke all on function public.record_claim_settlement(uuid, numeric, numeric, text, text, timestamptz) from public, anon;
revoke all on function public.reject_insurance_claim(uuid, text) from public, anon;
revoke all on function public.process_visit_payment(uuid, text, numeric, boolean) from public, anon;
revoke all on function public.mm_insurance_claims_immutable_context() from public, anon, authenticated;
revoke all on function public.mm_payments_cancel_claims() from public, anon, authenticated;
revoke all on function public.mm_visits_cancel_claims() from public, anon, authenticated;
grant execute on function public.upsert_insurance_organization(uuid, text, text, text, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.upsert_patient_coverage(uuid, uuid, text, uuid, text, text, date, date, boolean, text) to authenticated, service_role;
grant execute on function public.create_insurance_claim(uuid, uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.update_claim_status(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.record_claim_settlement(uuid, numeric, numeric, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.reject_insurance_claim(uuid, text) to authenticated, service_role;
grant execute on function public.process_visit_payment(uuid, text, numeric, boolean) to authenticated, service_role;


notify pgrst, 'reload schema';
