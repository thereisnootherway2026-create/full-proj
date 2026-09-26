-- Tiers payant: insurers, patient coverage and insurance claims.
--
-- Model (payments stays the single source of truth for money):
--   insurers          the clinic's organismes (CNSS, CNOPS, mutuelles, private insurers) + default rate.
--   patients          gains insurer_id / coverage_rate (member number stays in numero_cnss).
--   insurance_claims  one claim per payment (invoice): billed amount split into the insurer's share
--                     and the patient's share, then tracked a_deposer -> depose -> rembourse | rejete.
--
-- A reimbursement is recorded through process_visit_payment (method 'insurance'), so the invoice's
-- collected amount, status and cashier queue stay consistent with partial payments. The patient's
-- own share is collected through the normal cashier flow.
--
-- Nothing here talks to CNSS / mutuelle systems: claims are prepared, exported and followed by hand.
-- All writes go through SECURITY DEFINER RPCs (no direct table writes), all scoped to the caller's clinic.

create table if not exists public.insurers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  kind text not null default 'mutuelle' check (kind in ('cnss', 'cnops', 'mutuelle', 'prive')),
  default_rate numeric(5,2) not null default 80 check (default_rate >= 0 and default_rate <= 100),
  created_at timestamptz not null default now()
);
create unique index if not exists insurers_clinic_name_uniq on public.insurers (clinic_id, lower(btrim(name)));

alter table public.patients
  add column if not exists insurer_id uuid references public.insurers(id) on delete set null,
  add column if not exists coverage_rate numeric(5,2) check (coverage_rate is null or (coverage_rate >= 0 and coverage_rate <= 100));

create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  visit_id uuid,
  patient_id uuid not null,
  insurer_id uuid not null references public.insurers(id),
  amount_total numeric not null check (amount_total >= 0),
  coverage_rate numeric(5,2) not null check (coverage_rate >= 0 and coverage_rate <= 100),
  amount_insurer numeric not null check (amount_insurer >= 0),
  amount_patient numeric not null check (amount_patient >= 0),
  status text not null default 'a_deposer' check (status in ('a_deposer', 'depose', 'rembourse', 'rejete', 'annule')),
  reference text,
  note text,
  submitted_at timestamptz,
  reimbursed_at timestamptz,
  reimbursed_amount numeric not null default 0 check (reimbursed_amount >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_insurer + amount_patient = amount_total),
  check (reimbursed_amount <= amount_insurer)
);
create index if not exists insurance_claims_clinic_status on public.insurance_claims (clinic_id, status);
create index if not exists insurance_claims_insurer on public.insurance_claims (insurer_id);

alter table public.insurers enable row level security;
alter table public.insurance_claims enable row level security;

drop policy if exists insurers_select on public.insurers;
create policy insurers_select on public.insurers for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
drop policy if exists insurers_no_direct_write on public.insurers;
create policy insurers_no_direct_write on public.insurers for all using (false) with check (false);

drop policy if exists insurance_claims_select on public.insurance_claims;
create policy insurance_claims_select on public.insurance_claims for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
drop policy if exists insurance_claims_view_permission_gate on public.insurance_claims;
create policy insurance_claims_view_permission_gate on public.insurance_claims as restrictive for select
  using (public.is_admin() or public.mm_has_permission('billing.view'));
drop policy if exists insurance_claims_no_direct_write on public.insurance_claims;
create policy insurance_claims_no_direct_write on public.insurance_claims for all using (false) with check (false);

revoke insert, update, delete on public.insurers, public.insurance_claims from authenticated, anon;

-- ---------------------------------------------------------------- insurers
create or replace function public.upsert_insurer(
  p_id uuid, p_name text, p_kind text, p_default_rate numeric
)
returns public.insurers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_row public.insurers;
begin
  perform public.mm_assert_permission('billing.collect');
  if v_clinic is null then raise exception 'no clinic for current user'; end if;

  if p_id is null then
    insert into public.insurers (clinic_id, name, kind, default_rate)
    values (v_clinic, btrim(p_name), p_kind, p_default_rate)
    returning * into v_row;
  else
    update public.insurers
    set name = btrim(p_name), kind = p_kind, default_rate = p_default_rate
    where id = p_id and clinic_id = v_clinic
    returning * into v_row;
    if not found then raise exception 'insurer not found'; end if;
    -- keep the label used by existing filters/exports in step with the insurer name
    update public.patients set mutuelle = v_row.name where insurer_id = v_row.id and cabinet_id = v_clinic;
  end if;
  return v_row;
end;
$$;

create or replace function public.set_patient_coverage(
  p_patient_id uuid, p_insurer_id uuid, p_rate numeric default null
)
returns public.patients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient public.patients;
  v_insurer public.insurers;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_patient from public.patients where id = p_patient_id for update;
  if not found then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_patient.cabinet_id);

  if p_insurer_id is null then
    update public.patients set insurer_id = null, coverage_rate = null, mutuelle = null
    where id = p_patient_id returning * into v_patient;
  else
    select * into v_insurer from public.insurers where id = p_insurer_id;
    if not found then raise exception 'insurer not found'; end if;
    perform public.mm_assert_same_clinic(v_insurer.clinic_id);
    update public.patients
    set insurer_id = v_insurer.id, coverage_rate = coalesce(p_rate, v_insurer.default_rate), mutuelle = v_insurer.name
    where id = p_patient_id returning * into v_patient;
  end if;
  return v_patient;
end;
$$;

-- ---------------------------------------------------------------- claims
create or replace function public.create_insurance_claim(
  p_payment_id uuid, p_insurer_id uuid default null, p_rate numeric default null
)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_patient public.patients;
  v_insurer public.insurers;
  v_rate numeric;
  v_insurer_share numeric;
  v_claim public.insurance_claims;
begin
  perform public.mm_assert_permission('billing.collect');

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found'; end if;
  perform public.mm_assert_same_clinic(v_pay.clinic_id);
  if v_pay.status <> 'pending' then raise exception 'invoice is already settled'; end if;
  if v_pay.visit_id is null then raise exception 'invoice is not linked to a visit'; end if;
  if exists (select 1 from public.insurance_claims where payment_id = p_payment_id) then
    raise exception 'a claim already exists for this invoice';
  end if;

  select * into v_patient from public.patients where id = v_pay.patient_id;
  select * into v_insurer from public.insurers where id = coalesce(p_insurer_id, v_patient.insurer_id);
  if not found then raise exception 'no insurer selected'; end if;
  perform public.mm_assert_same_clinic(v_insurer.clinic_id);

  v_rate := coalesce(p_rate, v_patient.coverage_rate, v_insurer.default_rate);
  if v_rate < 0 or v_rate > 100 then raise exception 'invalid coverage rate'; end if;
  -- the insurer can never owe more than what is still uncollected
  v_insurer_share := least(round(v_pay.amount * v_rate / 100, 2), v_pay.amount - v_pay.amount_paid);

  insert into public.insurance_claims (
    clinic_id, payment_id, visit_id, patient_id, insurer_id,
    amount_total, coverage_rate, amount_insurer, amount_patient, created_by
  ) values (
    v_pay.clinic_id, v_pay.id, v_pay.visit_id, v_pay.patient_id, v_insurer.id,
    v_pay.amount, v_rate, v_insurer_share, v_pay.amount - v_insurer_share, auth.uid()
  ) returning * into v_claim;

  perform public.write_audit_log('INSURANCE_CLAIM_CREATED', 'insurance_claim', v_claim.id, null, to_jsonb(v_claim), null);
  return v_claim;
end;
$$;

create or replace function public.update_claim_status(
  p_claim_id uuid, p_status text, p_reference text default null, p_note text default null
)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);

  if p_status not in ('a_deposer', 'depose', 'rejete', 'annule') then
    raise exception 'use record_claim_reimbursement to mark a claim reimbursed';
  end if;
  if v_before.status in ('rembourse', 'annule') then raise exception 'claim is closed'; end if;
  if p_status in ('annule', 'a_deposer') and v_before.reimbursed_amount > 0 then
    raise exception 'claim already partly reimbursed';
  end if;

  update public.insurance_claims
  set status = p_status,
      reference = coalesce(nullif(btrim(p_reference), ''), reference),
      note = coalesce(p_note, note),
      submitted_at = case when p_status = 'depose' then coalesce(submitted_at, now()) else submitted_at end,
      updated_at = now()
  where id = p_claim_id returning * into v_after;

  perform public.write_audit_log('INSURANCE_CLAIM_STATUS', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$$;

create or replace function public.record_claim_reimbursement(
  p_claim_id uuid, p_amount numeric, p_reference text default null
)
returns public.insurance_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
  v_pay public.payments;
  v_open numeric;
  v_remaining numeric;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);

  if v_before.status <> 'depose' then raise exception 'claim must be submitted before a reimbursement'; end if;
  v_open := v_before.amount_insurer - v_before.reimbursed_amount;
  if p_amount is null or p_amount <= 0 or p_amount > v_open then
    raise exception 'invalid reimbursement: % exceeds what the insurer still owes (%)', p_amount, v_open;
  end if;

  select * into v_pay from public.payments where id = v_before.payment_id for update;
  v_remaining := v_pay.amount - v_pay.amount_paid;
  if p_amount > v_remaining then
    raise exception 'reimbursement % exceeds the invoice balance %', p_amount, v_remaining;
  end if;

  perform public.process_visit_payment(v_before.visit_id, 'insurance', p_amount, p_amount < v_remaining);

  update public.insurance_claims
  set reimbursed_amount = reimbursed_amount + p_amount,
      status = case when reimbursed_amount + p_amount >= amount_insurer then 'rembourse' else status end,
      reimbursed_at = now(),
      reference = coalesce(nullif(btrim(p_reference), ''), reference),
      updated_at = now()
  where id = p_claim_id returning * into v_after;

  perform public.write_audit_log('INSURANCE_CLAIM_REIMBURSED', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('amount', p_amount));
  return v_after;
end;
$$;

revoke all on function public.upsert_insurer(uuid, text, text, numeric) from public, anon;
revoke all on function public.set_patient_coverage(uuid, uuid, numeric) from public, anon;
revoke all on function public.create_insurance_claim(uuid, uuid, numeric) from public, anon;
revoke all on function public.update_claim_status(uuid, text, text, text) from public, anon;
revoke all on function public.record_claim_reimbursement(uuid, numeric, text) from public, anon;
grant execute on function public.upsert_insurer(uuid, text, text, numeric) to authenticated, service_role;
grant execute on function public.set_patient_coverage(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.create_insurance_claim(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.update_claim_status(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.record_claim_reimbursement(uuid, numeric, text) to authenticated, service_role;
