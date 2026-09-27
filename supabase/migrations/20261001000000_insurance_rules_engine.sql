-- Stage 4B (empty engine): insurance rules engine infrastructure, WITHOUT regulatory data.
--
-- No official source document has been obtained yet (see docs/insurance/stage-4b-source-audit.md),
-- so this migration creates structure only:
--   * NO act, TNR, rate, scheme or source row is inserted. Every calculation therefore ends in
--     MANUAL_REQUIRED, and the organism share keeps being entered by hand, now with a reason.
--   * The Stage 1-3.5 financial model is untouched: claims keep a single amount_claimed, which
--     stays the only input of mm_sync_invoice_third_party / invoice_financials. Claim lines are an
--     optional breakdown written with their claim, and must add up to amount_claimed.
--   * Claims created before this migration (no lines) stay valid as they are. They are not
--     converted into lines.
--
-- Layers
--   reference data (national, global, read-only for clinics; written only by reviewed migrations
--   or the service role): insurance_rule_sources, insurance_coverage_schemes,
--   insurance_act_catalog, insurance_tariffs (TNR), insurance_rules (national rows)
--   clinic data (RLS by clinic): insurance_rules (clinic contract rows),
--   insurance_tiers_payant_agreements, insurance_calculations, insurance_claim_lines
--
-- A reference row is used by the engine ONLY when verification_status = 'VERIFIED', which the
-- database accepts only with an archived source (checksum + retrieval date) and a reviewer. A
-- verified row is never edited or deleted: it is closed (effective_until) or superseded, and a new
-- row carries the new version. Rules are chosen by DATE OF CARE.

create extension if not exists btree_gist with schema extensions;

-- ============================================================ 1. source register
create table public.insurance_rule_sources (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,                -- stable human id, e.g. the register's source_id
  issuing_body text not null check (btrim(issuing_body) <> ''),
  title text not null check (btrim(title) <> ''),
  document_type text not null check (btrim(document_type) <> ''),
  publication_date date,
  effective_date date,
  source_url text,
  version text,
  checksum text,                            -- sha256 (hex) of the archived document
  retrieved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_rule_sources_code_key unique (source_code),
  constraint insurance_rule_sources_code_check check (source_code ~ '^[A-Z0-9][A-Z0-9_.-]*$'),
  constraint insurance_rule_sources_checksum_check check (checksum is null or checksum ~ '^[0-9a-f]{64}$')
);

-- ============================================================ 2. coverage schemes
-- A legal scheme (regime) is not an organization: an organization manages several schemes and a
-- scheme can change manager. Empty until the texts defining them are archived.
create table public.insurance_coverage_schemes (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]*$'),
  label text not null check (btrim(label) <> ''),
  coverage_layer text not null check (coverage_layer in ('BASE', 'COMPLEMENTARY')),
  source_id uuid references public.insurance_rule_sources(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The scheme a patient's coverage belongs to (nullable: unknown for every existing coverage).
alter table public.patient_coverages
  add column if not exists scheme_code text references public.insurance_coverage_schemes(code);

-- ============================================================ 3. act catalog (nomenclature)
create table public.insurance_act_catalog (
  id uuid primary key default gen_random_uuid(),
  nomenclature text not null check (nomenclature ~ '^[A-Z][A-Z0-9_]*$'),   -- e.g. a code for NGAP / NABM / CCAM
  code text not null check (btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  category text not null check (category ~ '^[A-Z][A-Z0-9_]*$'),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  effective_from date not null,
  effective_until date,                     -- exclusive
  source_id uuid references public.insurance_rule_sources(id),
  verification_status text not null default 'DRAFT'
    check (verification_status in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'SUPERSEDED', 'WITHDRAWN')),
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_act_catalog_dates_check check (effective_until is null or effective_until > effective_from),
  -- one verified version of an act at any date
  constraint insurance_act_catalog_no_verified_overlap exclude using gist (
    nomenclature with =, code with =, daterange(effective_from, effective_until, '[)') with &&
  ) where (verification_status = 'VERIFIED')
);
create index insurance_act_catalog_lookup on public.insurance_act_catalog (nomenclature, code, effective_from);

-- ============================================================ 4. reference tariffs (TNR)
-- tariff_type says how the reference amount is obtained. New mechanisms are added as new types
-- (with their fields or `parameters`) by a later migration; an engine that does not know a type
-- answers MANUAL_REQUIRED instead of guessing.
create table public.insurance_tariffs (
  id uuid primary key default gen_random_uuid(),
  nomenclature text not null check (nomenclature ~ '^[A-Z][A-Z0-9_]*$'),
  act_code text not null check (btrim(act_code) <> ''),
  tariff_type text not null check (tariff_type in ('KEY_LETTER', 'FLAT')),
  key_letter text,
  key_letter_value numeric(12,4),
  coefficient numeric(12,4),
  flat_amount numeric(12,2),
  parameters jsonb not null default '{}' check (jsonb_typeof(parameters) = 'object'),
  currency text not null default 'MAD' check (currency = 'MAD'),
  -- scope (null = any)
  sector text check (sector is null or sector ~ '^[A-Z][A-Z0-9_]*$'),
  provider_category text check (provider_category is null or provider_category ~ '^[A-Z][A-Z0-9_]*$'),
  scheme_code text references public.insurance_coverage_schemes(code),
  organization_type text check (organization_type is null or organization_type in ('AMO_MANAGER', 'MUTUELLE', 'PRIVATE_INSURER', 'OTHER')),
  effective_from date not null,
  effective_until date,
  source_id uuid references public.insurance_rule_sources(id),
  verification_status text not null default 'DRAFT'
    check (verification_status in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'SUPERSEDED', 'WITHDRAWN')),
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_tariffs_dates_check check (effective_until is null or effective_until > effective_from),
  constraint insurance_tariffs_key_letter_check check (tariff_type <> 'KEY_LETTER' or (
    key_letter is not null and btrim(key_letter) <> '' and key_letter_value > 0 and coefficient > 0 and flat_amount is null)),
  constraint insurance_tariffs_flat_check check (tariff_type <> 'FLAT' or (
    flat_amount > 0 and key_letter is null and key_letter_value is null and coefficient is null)),
  constraint insurance_tariffs_no_verified_overlap exclude using gist (
    nomenclature with =, act_code with =, (coalesce(sector, '')) with =, (coalesce(provider_category, '')) with =,
    (coalesce(scheme_code, '')) with =, (coalesce(organization_type, '')) with =,
    daterange(effective_from, effective_until, '[)') with &&
  ) where (verification_status = 'VERIFIED')
);
create index insurance_tariffs_lookup on public.insurance_tariffs (nomenclature, act_code, effective_from);

-- ============================================================ 5. insurance rules
create table public.insurance_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null check (rule_key ~ '^[A-Z0-9][A-Z0-9_.-]*$'),
  version integer not null default 1 check (version > 0),
  -- scope (null = any). clinic_id set = a clinic's own contract rule (e.g. a complementary
  -- contract), explicit and visible only to that clinic; null = national rule.
  clinic_id uuid references public.cabinets(id) on delete cascade,
  organization_id uuid,
  organization_type text check (organization_type is null or organization_type in ('AMO_MANAGER', 'MUTUELLE', 'PRIVATE_INSURER', 'OTHER')),
  coverage_layer text not null check (coverage_layer in ('BASE', 'COMPLEMENTARY')),
  scheme_code text references public.insurance_coverage_schemes(code),
  nomenclature text check (nomenclature is null or nomenclature ~ '^[A-Z][A-Z0-9_]*$'),
  act_code text,
  act_category text check (act_category is null or act_category ~ '^[A-Z][A-Z0-9_]*$'),
  sector text check (sector is null or sector ~ '^[A-Z][A-Z0-9_]*$'),
  provider_category text check (provider_category is null or provider_category ~ '^[A-Z][A-Z0-9_]*$'),
  -- what the rule says
  rule_type text not null check (rule_type in ('COVERAGE_RATE', 'FIXED_COVERAGE', 'NOT_COVERED')),
  basis text check (basis in ('TNR', 'BILLED')),       -- what coverage_rate applies to
  coverage_rate numeric(7,6) check (coverage_rate >= 0 and coverage_rate <= 1),
  fixed_coverage_amount numeric(12,2) check (fixed_coverage_amount > 0),
  ceiling_amount numeric(12,2) check (ceiling_amount > 0),
  conditions jsonb not null default '{}' check (jsonb_typeof(conditions) = 'object'),
  requires_prior_authorization boolean not null default false,
  tiers_payant_eligibility text not null default 'UNKNOWN'
    check (tiers_payant_eligibility in ('UNKNOWN', 'ELIGIBLE', 'NOT_ELIGIBLE', 'REQUIRES_AGREEMENT')),
  effective_from date not null,
  effective_until date,
  source_id uuid references public.insurance_rule_sources(id),
  verification_status text not null default 'DRAFT'
    check (verification_status in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'SUPERSEDED', 'WITHDRAWN')),
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_rules_key_version unique (rule_key, version),
  constraint insurance_rules_organization_fkey
    foreign key (organization_id, clinic_id) references public.insurance_organizations(id, clinic_id),
  constraint insurance_rules_organization_scope_check check (organization_id is null or clinic_id is not null),
  -- a rule always names the act or the category of acts it is about
  constraint insurance_rules_act_scope_check check (act_code is not null or act_category is not null),
  constraint insurance_rules_act_code_check check (act_code is null or nomenclature is not null),
  constraint insurance_rules_dates_check check (effective_until is null or effective_until > effective_from),
  constraint insurance_rules_type_check check (case rule_type
    when 'COVERAGE_RATE' then coverage_rate is not null and basis is not null and fixed_coverage_amount is null
    when 'FIXED_COVERAGE' then fixed_coverage_amount is not null and coverage_rate is null and basis is null
    when 'NOT_COVERED' then coverage_rate is null and fixed_coverage_amount is null and ceiling_amount is null and basis is null
  end),
  -- engine version 1 evaluates no condition: a conditional rule cannot be made executable until an
  -- engine that evaluates its conditions exists (that migration relaxes this check)
  constraint insurance_rules_conditions_supported check (verification_status <> 'VERIFIED' or conditions = '{}'::jsonb),
  -- two verified rules with exactly the same scope cannot overlap in time
  constraint insurance_rules_no_verified_overlap exclude using gist (
    (coalesce(clinic_id::text, '')) with =, (coalesce(organization_id::text, '')) with =,
    (coalesce(organization_type, '')) with =, coverage_layer with =, (coalesce(scheme_code, '')) with =,
    (coalesce(nomenclature, '')) with =, (coalesce(act_code, '')) with =, (coalesce(act_category, '')) with =,
    (coalesce(sector, '')) with =, (coalesce(provider_category, '')) with =,
    daterange(effective_from, effective_until, '[)') with &&
  ) where (verification_status = 'VERIFIED')
);
create index insurance_rules_lookup on public.insurance_rules (coverage_layer, act_code, act_category, effective_from);
create index insurance_rules_clinic on public.insurance_rules (clinic_id) where clinic_id is not null;

-- ============================================================ 6. tiers-payant agreements
-- The evidence that an establishment / practitioner works in tiers payant with an organization
-- for some acts. Nothing here means "patient pays" (today's behaviour).
create table public.insurance_tiers_payant_agreements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.cabinets(id) on delete cascade,
  organization_id uuid not null,
  provider_id uuid,                         -- practitioner covered; null = the whole establishment
  nomenclature text,
  act_code text,
  act_category text,
  agreement_reference text not null check (btrim(agreement_reference) <> ''),
  effective_from date not null,
  effective_until date,
  source_id uuid references public.insurance_rule_sources(id),
  verification_status text not null default 'DRAFT'
    check (verification_status in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'SUPERSEDED', 'WITHDRAWN')),
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_tp_agreements_organization_fkey
    foreign key (organization_id, clinic_id) references public.insurance_organizations(id, clinic_id),
  constraint insurance_tp_agreements_act_check check (act_code is null or nomenclature is not null),
  constraint insurance_tp_agreements_dates_check check (effective_until is null or effective_until > effective_from)
);
create index insurance_tp_agreements_clinic_org on public.insurance_tiers_payant_agreements (clinic_id, organization_id);

-- ============================================================ 7. reference data guards
-- VERIFIED needs an archived source and a reviewer; a verified row is never rewritten or deleted.
create or replace function public.mm_insurance_reference_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- the only columns that may move on a verified row: closing it, or marking it superseded / withdrawn
  v_mutable text[] := array['verification_status', 'effective_until', 'verification_note', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    if old.verification_status in ('VERIFIED', 'SUPERSEDED', 'WITHDRAWN') then
      raise exception '% row % was verified: it can be closed or superseded, never deleted', tg_table_name, old.id;
    end if;
    return old;
  end if;

  if new.verification_status = 'VERIFIED' then
    if new.source_id is null then
      raise exception 'a VERIFIED % row must reference its source', tg_table_name;
    end if;
    if not exists (select 1 from public.insurance_rule_sources s
                   where s.id = new.source_id and s.checksum is not null and s.retrieved_at is not null) then
      raise exception 'a VERIFIED % row must reference an archived source (checksum and retrieval date)', tg_table_name;
    end if;
    if new.verified_by is null or new.verified_at is null then
      raise exception 'a VERIFIED % row must record who verified it and when', tg_table_name;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.verification_status in ('VERIFIED', 'SUPERSEDED', 'WITHDRAWN') then
    if old.verification_status <> 'VERIFIED' then
      raise exception '% row % is closed (%)', tg_table_name, old.id, old.verification_status;
    end if;
    if new.verification_status not in ('VERIFIED', 'SUPERSEDED', 'WITHDRAWN') then
      raise exception 'a verified row cannot go back to %', new.verification_status;
    end if;
    if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
      raise exception 'a verified % row is immutable: register a new version instead', tg_table_name;
    end if;
    if old.effective_until is not null and new.effective_until is distinct from old.effective_until then
      raise exception 'the end date of a verified row is already set';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_insurance_act_catalog_guard before insert or update or delete on public.insurance_act_catalog
  for each row execute function public.mm_insurance_reference_guard();
create trigger trg_insurance_tariffs_guard before insert or update or delete on public.insurance_tariffs
  for each row execute function public.mm_insurance_reference_guard();
create trigger trg_insurance_rules_guard before insert or update or delete on public.insurance_rules
  for each row execute function public.mm_insurance_reference_guard();
create trigger trg_insurance_tp_agreements_guard before insert or update or delete on public.insurance_tiers_payant_agreements
  for each row execute function public.mm_insurance_reference_guard();

-- A source that backs verified data is frozen (a new version of a text is a new source row).
create or replace function public.mm_insurance_sources_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.insurance_act_catalog where source_id = old.id and verification_status in ('VERIFIED', 'SUPERSEDED', 'WITHDRAWN'))
     or exists (select 1 from public.insurance_tariffs where source_id = old.id and verification_status in ('VERIFIED', 'SUPERSEDED', 'WITHDRAWN'))
     or exists (select 1 from public.insurance_rules where source_id = old.id and verification_status in ('VERIFIED', 'SUPERSEDED', 'WITHDRAWN'))
     or exists (select 1 from public.insurance_tiers_payant_agreements where source_id = old.id and verification_status in ('VERIFIED', 'SUPERSEDED', 'WITHDRAWN')) then
    if tg_op = 'DELETE' then raise exception 'source % backs verified data: it cannot be deleted', old.source_code; end if;
    if (to_jsonb(new) - array['notes', 'updated_at']) is distinct from (to_jsonb(old) - array['notes', 'updated_at']) then
      raise exception 'source % backs verified data: register a new version instead of editing it', old.source_code;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_insurance_rule_sources_guard before update or delete on public.insurance_rule_sources
  for each row execute function public.mm_insurance_sources_guard();

-- ============================================================ 8. calculation snapshots
-- One immutable row per claim line: what the engine was given, what it found (act, tariff, rule,
-- sources, copied by value) and what it answered, plus the manual entry when there was one.
-- Written with the claim, in the same transaction; never updated, never deleted.
create table public.insurance_calculations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.cabinets(id) on delete cascade,
  claim_id uuid not null,
  patient_id uuid not null,
  organization_id uuid not null,
  invoice_id uuid not null,
  coverage_id uuid not null,
  line_no integer not null check (line_no > 0),
  date_of_care date not null,
  calculated_at timestamptz not null default now(),
  calculated_by uuid,
  engine_version text not null,
  status text not null check (status in ('CALCULATED', 'MANUAL_REQUIRED', 'CONFLICT')),
  match_outcome text not null check (match_outcome in
    ('NO_MATCH', 'ONE_VERIFIED_MATCH', 'MULTIPLE_EQUAL_VALID_MATCHES', 'EXPIRED_RULE', 'UNVERIFIED_MATCH')),
  reason_code text,
  reason text,
  act_id uuid references public.insurance_act_catalog(id),
  act_code text,
  act_label text,
  billed_amount numeric(12,2) not null check (billed_amount > 0),
  tnr_amount numeric(12,2),
  reimbursement_basis numeric(12,2),
  organism_amount numeric(12,2),
  patient_amount numeric(12,2),
  rule_id uuid references public.insurance_rules(id),
  rule_key text,
  rule_version integer,
  tariff_id uuid references public.insurance_tariffs(id),
  source_ids uuid[] not null default '{}',
  coverage_context jsonb not null,
  result jsonb not null,                    -- the engine's full answer, explanation included
  manual_override jsonb,                    -- {amount, reason, entered_by, entered_at}
  constraint insurance_calculations_claim_fkey
    foreign key (claim_id, clinic_id, patient_id, organization_id)
    references public.insurance_claims(id, clinic_id, patient_id, organization_id),
  constraint insurance_calculations_invoice_fkey
    foreign key (invoice_id, clinic_id, patient_id) references public.payments(id, clinic_id, patient_id),
  constraint insurance_calculations_coverage_fkey
    foreign key (coverage_id, clinic_id, patient_id) references public.patient_coverages(id, clinic_id, patient_id),
  constraint insurance_calculations_claim_line_key unique (claim_id, line_no),
  -- an automatic amount exists only when the engine calculated one, from a rule
  constraint insurance_calculations_calculated_check check (
    case when status = 'CALCULATED' then organism_amount is not null and patient_amount is not null and rule_id is not null
         else organism_amount is null and patient_amount is null and rule_id is null end),
  -- without an automatic amount, the line's amount was necessarily entered by hand
  constraint insurance_calculations_manual_check check (status = 'CALCULATED' or manual_override is not null)
);
create index insurance_calculations_claim on public.insurance_calculations (claim_id);

-- ============================================================ 9. claim lines
create table public.insurance_claim_lines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.cabinets(id) on delete cascade,
  claim_id uuid not null,
  patient_id uuid not null,
  organization_id uuid not null,
  line_no integer not null check (line_no > 0),
  invoice_line_id uuid references public.facture_lignes(id),       -- the itemised invoice line, when there is one
  clinic_act_id uuid references public.actes_catalogue(id),        -- the clinic's own act, when known
  act_id uuid references public.insurance_act_catalog(id),         -- the reference act, when identified
  nomenclature text,
  act_code text,
  label text not null check (btrim(label) <> ''),
  date_of_care date not null,
  billed_amount numeric(12,2) not null check (billed_amount > 0),
  tnr_amount numeric(12,2),
  reimbursement_basis numeric(12,2),
  organism_amount numeric(12,2) not null check (organism_amount >= 0),
  -- what this claim's organism does not cover on the line (other layers not deducted)
  patient_amount numeric(12,2) not null check (patient_amount >= 0),
  rule_id uuid references public.insurance_rules(id),
  calculation_status text not null check (calculation_status in ('CALCULATED', 'MANUAL_REQUIRED', 'CONFLICT')),
  amount_source text not null check (amount_source in ('CALCULATED', 'MANUAL')),
  manual_reason text,
  entered_by uuid,
  entered_at timestamptz not null default now(),
  calculation_snapshot_id uuid not null references public.insurance_calculations(id),
  created_at timestamptz not null default now(),
  constraint insurance_claim_lines_claim_fkey
    foreign key (claim_id, clinic_id, patient_id, organization_id)
    references public.insurance_claims(id, clinic_id, patient_id, organization_id),
  constraint insurance_claim_lines_claim_line_key unique (claim_id, line_no),
  constraint insurance_claim_lines_snapshot_key unique (calculation_snapshot_id),
  constraint insurance_claim_lines_split_check check (
    organism_amount <= billed_amount and patient_amount = billed_amount - organism_amount),
  -- a hand-entered amount always says why; an automatic one is always tied to its rule
  constraint insurance_claim_lines_source_check check (case amount_source
    when 'MANUAL' then manual_reason is not null and btrim(manual_reason) <> '' and entered_by is not null
    when 'CALCULATED' then manual_reason is null and calculation_status = 'CALCULATED' and rule_id is not null
  end)
);
create index insurance_claim_lines_claim on public.insurance_claim_lines (claim_id);

-- Lines and snapshots are written with their claim, in the transaction that creates it (a claim's
-- created_at is immutable and equals now() only there): no breakdown is added to an older claim.
create or replace function public.mm_insurance_calculations_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.insurance_claims where id = new.claim_id and created_at = now()) then
    raise exception 'a calculation snapshot is recorded with its claim only';
  end if;
  return new;
end;
$$;
create trigger trg_insurance_calculations_before_insert before insert on public.insurance_calculations
  for each row execute function public.mm_insurance_calculations_before_insert();

create or replace function public.mm_claim_lines_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_snap public.insurance_calculations;
begin
  if not exists (select 1 from public.insurance_claims where id = new.claim_id and created_at = now()) then
    raise exception 'claim lines are recorded with their claim only';
  end if;
  select * into v_snap from public.insurance_calculations where id = new.calculation_snapshot_id;
  if not found or v_snap.claim_id <> new.claim_id or v_snap.line_no <> new.line_no
     or v_snap.billed_amount <> new.billed_amount or v_snap.status <> new.calculation_status then
    raise exception 'claim line does not match its calculation snapshot';
  end if;
  if new.amount_source = 'CALCULATED'
     and (v_snap.organism_amount is distinct from new.organism_amount or v_snap.rule_id is distinct from new.rule_id) then
    raise exception 'a calculated line carries the amount of its calculation';
  end if;
  if new.amount_source = 'MANUAL'
     and (v_snap.manual_override is null or (v_snap.manual_override->>'amount')::numeric <> new.organism_amount) then
    raise exception 'a manual line must match the manual entry recorded in its snapshot';
  end if;
  return new;
end;
$$;
create trigger trg_claim_lines_before_insert before insert on public.insurance_claim_lines
  for each row execute function public.mm_claim_lines_before_insert();

-- Checked at commit: a claim with lines is exactly the sum of its lines.
create or replace function public.mm_claim_lines_total_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_claimed numeric;
  v_sum numeric;
begin
  select amount_claimed into v_claimed from public.insurance_claims where id = new.claim_id;
  select sum(organism_amount) into v_sum from public.insurance_claim_lines where claim_id = new.claim_id;
  if v_sum is distinct from v_claimed then
    raise exception 'claim lines total % does not match the amount claimed %', v_sum, v_claimed;
  end if;
  return null;
end;
$$;
create constraint trigger trg_claim_lines_total after insert on public.insurance_claim_lines
  deferrable initially deferred
  for each row execute function public.mm_claim_lines_total_check();

create or replace function public.mm_insurance_calculation_records_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end;
$$;
create trigger trg_insurance_calculations_immutable before update or delete on public.insurance_calculations
  for each row execute function public.mm_insurance_calculation_records_immutable();
create trigger trg_insurance_claim_lines_immutable before update or delete on public.insurance_claim_lines
  for each row execute function public.mm_insurance_calculation_records_immutable();

-- ============================================================ 10. engine
-- Scope matching. A null scope column matches anything; a set one must equal the input (a null
-- input never matches a set column).
create or replace function public.mm_insurance_rules_in_scope(
  p_clinic_id uuid, p_organization_id uuid, p_organization_type text, p_layer text, p_scheme_code text,
  p_nomenclature text, p_act_code text, p_act_category text, p_sector text, p_provider_category text
)
returns setof public.insurance_rules
language sql
stable
set search_path = public
as $$
  select r.* from public.insurance_rules r
  where r.coverage_layer = p_layer
    and (r.clinic_id is null or r.clinic_id = p_clinic_id)
    and (r.organization_id is null or r.organization_id = p_organization_id)
    and (r.organization_type is null or r.organization_type = p_organization_type)
    and (r.scheme_code is null or r.scheme_code = p_scheme_code)
    and (r.nomenclature is null or r.nomenclature = p_nomenclature)
    and (r.act_code is null or r.act_code = p_act_code)
    and (r.act_category is null or r.act_category = p_act_category)
    and (r.sector is null or r.sector = p_sector)
    and (r.provider_category is null or r.provider_category = p_provider_category)
$$;

create or replace function public.mm_insurance_tariffs_in_scope(
  p_nomenclature text, p_act_code text, p_organization_type text, p_scheme_code text, p_sector text, p_provider_category text
)
returns setof public.insurance_tariffs
language sql
stable
set search_path = public
as $$
  select t.* from public.insurance_tariffs t
  where t.nomenclature = p_nomenclature and t.act_code = p_act_code
    and (t.organization_type is null or t.organization_type = p_organization_type)
    and (t.scheme_code is null or t.scheme_code = p_scheme_code)
    and (t.sector is null or t.sector = p_sector)
    and (t.provider_category is null or t.provider_category = p_provider_category)
$$;

-- The scope dimensions a row constrains. Among matching rows, one is preferred over another only
-- when it constrains strictly more dimensions (a superset); anything else is a tie, i.e. CONFLICT.
create or replace function public.mm_insurance_rule_dims(r public.insurance_rules)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when r.clinic_id is not null then 'clinic' end,
    case when r.organization_id is not null then 'organization' end,
    case when r.organization_type is not null then 'organization_type' end,
    case when r.scheme_code is not null then 'scheme' end,
    case when r.nomenclature is not null then 'nomenclature' end,
    case when r.act_code is not null then 'act' end,
    case when r.act_category is not null then 'category' end,
    case when r.sector is not null then 'sector' end,
    case when r.provider_category is not null then 'provider_category' end
  ], null)
$$;

create or replace function public.mm_insurance_tariff_dims(t public.insurance_tariffs)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when t.organization_type is not null then 'organization_type' end,
    case when t.scheme_code is not null then 'scheme' end,
    case when t.sector is not null then 'sector' end,
    case when t.provider_category is not null then 'provider_category' end
  ], null)
$$;

create or replace function public.mm_insurance_source_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'source_code', s.source_code, 'title', s.title, 'issuing_body', s.issuing_body,
    'document_type', s.document_type, 'publication_date', s.publication_date, 'effective_date', s.effective_date,
    'version', s.version, 'source_url', s.source_url, 'checksum', s.checksum, 'retrieved_at', s.retrieved_at)
  from public.insurance_rule_sources s where s.id = p_id
$$;

-- calculateInsuranceLine. Pure: reads, never writes.
--   p_line:    {act_id | nomenclature + act_code, label, billed_amount, base_organism_amount}
--   p_context: {provider_id, sector, provider_category, payment_mode}
-- Answers CALCULATED only from exactly one verified rule (and, when the rule needs it, exactly one
-- verified TNR) in force on the date of care. Everything else is MANUAL_REQUIRED (nothing found,
-- expired, unverified) or CONFLICT (several equally specific verified rows), with no amount: a
-- missing rule is never read as 0 %, 100 % or "TNR = billed amount".
create or replace function public.mm_calculate_insurance_line(
  p_clinic_id uuid,
  p_coverage_id uuid,
  p_date_of_care date,
  p_line jsonb,
  p_context jsonb default '{}'
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c_engine constant text := '1';
  v_cov public.patient_coverages;
  v_org public.insurance_organizations;
  v_layer text;
  v_billed numeric;
  v_base numeric;
  v_remaining numeric;
  v_sector text := nullif(btrim(p_context->>'sector'), '');
  v_pcat text := nullif(btrim(p_context->>'provider_category'), '');
  v_provider uuid := nullif(p_context->>'provider_id', '')::uuid;
  v_nom text;
  v_code text;
  v_act public.insurance_act_catalog;
  v_rule public.insurance_rules;
  v_tariff public.insurance_tariffs;
  v_ids uuid[];
  v_status text := 'MANUAL_REQUIRED';
  v_outcome text := 'NO_MATCH';
  v_reason_code text;
  v_reason text;
  v_conflicts uuid[];
  v_tnr numeric;
  v_basis numeric;
  v_org_amt numeric;
  v_pat numeric;
  v_prior text := 'UNKNOWN';
  v_tp jsonb := jsonb_build_object('status', 'UNVERIFIED',
    'reason', 'Aucune règle vérifiée ne détermine l''éligibilité au tiers payant.');
  v_agreement uuid;
  v_sources jsonb := '[]';
  v_steps jsonb := '[]';
begin
  v_billed := round((p_line->>'billed_amount')::numeric, 2);
  if v_billed is null or v_billed <= 0 then raise exception 'billed amount must be positive'; end if;
  if p_date_of_care is null then raise exception 'date of care is required'; end if;

  select * into v_cov from public.patient_coverages where id = p_coverage_id and clinic_id = p_clinic_id;
  if not found then raise exception 'coverage not found'; end if;
  if v_cov.coverage_type = 'NONE' then raise exception 'coverage is not an insurance coverage'; end if;
  select * into v_org from public.insurance_organizations where id = v_cov.organization_id;
  -- AMO is the base layer; a complementary / private contract comes on top of it
  v_layer := case when v_cov.coverage_type = 'AMO' then 'BASE' else 'COMPLEMENTARY' end;
  v_base := round(nullif(p_line->>'base_organism_amount', '')::numeric, 2);
  if v_base is not null and (v_base < 0 or v_base > v_billed) then
    raise exception 'base organism amount must be between 0 and the billed amount';
  end if;

  v_steps := v_steps || jsonb_build_object('key', 'billed', 'label', 'Honoraires', 'value', v_billed);

  <<calc>>
  begin
    -- coverage as recorded for that date (recorded information, not a verified entitlement)
    if (v_cov.valid_from is not null and v_cov.valid_from > p_date_of_care)
       or (v_cov.valid_until is not null and v_cov.valid_until < p_date_of_care) then
      v_reason_code := 'COVERAGE_NOT_VALID_ON_DATE';
      v_reason := 'La couverture enregistrée n''était pas valide à la date des soins.';
      exit calc;
    end if;

    -- 1. the act, as known to the verified reference catalog on the date of care
    if nullif(p_line->>'act_id', '') is not null then
      select nomenclature, code into v_nom, v_code from public.insurance_act_catalog where id = (p_line->>'act_id')::uuid;
      if not found then raise exception 'reference act not found'; end if;
    else
      v_nom := upper(nullif(btrim(p_line->>'nomenclature'), ''));
      v_code := nullif(btrim(p_line->>'act_code'), '');
    end if;
    if v_nom is null or v_code is null then
      v_reason_code := 'ACT_NOT_IDENTIFIED';
      v_reason := 'Aucune règle d''assurance vérifiée n''est disponible pour cet acte à la date des soins (acte non rattaché à la nomenclature de référence).';
      exit calc;
    end if;
    select * into v_act from public.insurance_act_catalog
    where nomenclature = v_nom and code = v_code and verification_status = 'VERIFIED'
      and effective_from <= p_date_of_care and (effective_until is null or p_date_of_care < effective_until);
    if not found then
      v_outcome := case
        when exists (select 1 from public.insurance_act_catalog where nomenclature = v_nom and code = v_code
                     and verification_status in ('VERIFIED', 'SUPERSEDED') and effective_until <= p_date_of_care) then 'EXPIRED_RULE'
        when exists (select 1 from public.insurance_act_catalog where nomenclature = v_nom and code = v_code
                     and verification_status in ('DRAFT', 'UNVERIFIED')) then 'UNVERIFIED_MATCH'
        else 'NO_MATCH' end;
      v_reason_code := 'ACT_NOT_VERIFIED';
      v_reason := 'Aucune règle d''assurance vérifiée n''est disponible pour cet acte à la date des soins (acte absent de la nomenclature vérifiée à cette date).';
      exit calc;
    end if;
    v_sources := v_sources || coalesce(public.mm_insurance_source_json(v_act.source_id), '[]'::jsonb);
    v_steps := v_steps || jsonb_build_object('key', 'act', 'label', 'Acte', 'value', v_act.label,
      'detail', v_act.nomenclature || ' ' || v_act.code);

    -- 2. the rule: verified, in force on the date of care, most specific; a tie is a conflict
    with m as (
      select r.*, public.mm_insurance_rule_dims(r) as dims
      from public.mm_insurance_rules_in_scope(p_clinic_id, v_org.id, v_org.organization_type, v_layer, v_cov.scheme_code,
                                              v_act.nomenclature, v_act.code, v_act.category, v_sector, v_pcat) r
      where r.verification_status = 'VERIFIED'
        and r.effective_from <= p_date_of_care and (r.effective_until is null or p_date_of_care < r.effective_until)
    )
    select array_agg(m.id order by m.id) into v_ids from m
    where not exists (select 1 from m d where d.dims @> m.dims and not m.dims @> d.dims);

    if coalesce(array_length(v_ids, 1), 0) > 1 then
      v_status := 'CONFLICT';
      v_outcome := 'MULTIPLE_EQUAL_VALID_MATCHES';
      v_conflicts := v_ids;
      v_reason_code := 'RULE_CONFLICT';
      v_reason := 'Plusieurs règles vérifiées s''appliquent à égalité à cet acte : calcul impossible sans arbitrage.';
      exit calc;
    elsif coalesce(array_length(v_ids, 1), 0) = 0 then
      v_outcome := case
        when exists (select 1 from public.mm_insurance_rules_in_scope(p_clinic_id, v_org.id, v_org.organization_type, v_layer, v_cov.scheme_code,
                       v_act.nomenclature, v_act.code, v_act.category, v_sector, v_pcat) r
                     where r.verification_status in ('VERIFIED', 'SUPERSEDED') and r.effective_until <= p_date_of_care) then 'EXPIRED_RULE'
        when exists (select 1 from public.mm_insurance_rules_in_scope(p_clinic_id, v_org.id, v_org.organization_type, v_layer, v_cov.scheme_code,
                       v_act.nomenclature, v_act.code, v_act.category, v_sector, v_pcat) r
                     where r.verification_status in ('DRAFT', 'UNVERIFIED')
                       and r.effective_from <= p_date_of_care and (r.effective_until is null or p_date_of_care < r.effective_until)) then 'UNVERIFIED_MATCH'
        else 'NO_MATCH' end;
      v_reason_code := case v_outcome when 'EXPIRED_RULE' then 'RULE_EXPIRED' when 'UNVERIFIED_MATCH' then 'RULE_NOT_VERIFIED' else 'NO_VERIFIED_RULE' end;
      v_reason := case v_outcome
        when 'EXPIRED_RULE' then 'La règle d''assurance connue pour cet acte n''était plus en vigueur à la date des soins.'
        when 'UNVERIFIED_MATCH' then 'Une règle existe pour cet acte mais elle n''est pas vérifiée : elle n''est pas appliquée.'
        else 'Aucune règle d''assurance vérifiée n''est disponible pour cet acte à la date des soins.' end;
      exit calc;
    end if;

    select * into v_rule from public.insurance_rules where id = v_ids[1];
    v_outcome := 'ONE_VERIFIED_MATCH';
    v_sources := v_sources || coalesce(public.mm_insurance_source_json(v_rule.source_id), '[]'::jsonb);
    v_steps := v_steps || jsonb_build_object('key', 'rule', 'label', 'Règle', 'value', v_rule.rule_key,
      'version', v_rule.version, 'rule_type', v_rule.rule_type, 'basis', v_rule.basis, 'coverage_rate', v_rule.coverage_rate,
      'fixed_coverage_amount', v_rule.fixed_coverage_amount, 'ceiling_amount', v_rule.ceiling_amount,
      'effective_from', v_rule.effective_from, 'effective_until', v_rule.effective_until);

    -- what the rule says beyond the amount
    v_prior := case when v_rule.requires_prior_authorization then 'REQUIRED' else 'NOT_REQUIRED' end;
    v_tp := case v_rule.tiers_payant_eligibility
      when 'ELIGIBLE' then jsonb_build_object('status', 'ELIGIBLE', 'rule_id', v_rule.id)
      when 'NOT_ELIGIBLE' then jsonb_build_object('status', 'NOT_ELIGIBLE', 'rule_id', v_rule.id)
      when 'REQUIRES_AGREEMENT' then null
      else jsonb_build_object('status', 'UNVERIFIED', 'rule_id', v_rule.id,
        'reason', 'La règle applicable ne se prononce pas sur le tiers payant.') end;
    if v_tp is null then
      select a.id into v_agreement from public.insurance_tiers_payant_agreements a
      where a.clinic_id = p_clinic_id and a.organization_id = v_org.id and a.verification_status = 'VERIFIED'
        and a.effective_from <= p_date_of_care and (a.effective_until is null or p_date_of_care < a.effective_until)
        and (a.provider_id is null or a.provider_id = v_provider)
        and (a.nomenclature is null or a.nomenclature = v_act.nomenclature)
        and (a.act_code is null or a.act_code = v_act.code)
        and (a.act_category is null or a.act_category = v_act.category)
      order by a.id limit 1;
      v_tp := case when v_agreement is not null
        then jsonb_build_object('status', 'ELIGIBLE', 'rule_id', v_rule.id, 'agreement_id', v_agreement)
        else jsonb_build_object('status', 'AGREEMENT_NOT_FOUND', 'rule_id', v_rule.id,
          'reason', 'La règle exige une convention de tiers payant vérifiée, introuvable pour ce cabinet à cette date.') end;
    end if;

    -- complementary layer: computed on what the base layer leaves, which must be known
    if v_layer = 'COMPLEMENTARY' and v_base is null then
      v_status := 'MANUAL_REQUIRED';
      v_reason_code := 'BASE_AMOUNT_REQUIRED';
      v_reason := 'La part de l''assurance de base doit être connue avant de calculer la part complémentaire.';
      exit calc;
    end if;
    v_remaining := v_billed - case when v_layer = 'COMPLEMENTARY' then v_base else 0 end;

    -- 3. the reference tariff (TNR), when the rule is expressed on it
    if v_rule.rule_type = 'COVERAGE_RATE' and v_rule.basis = 'TNR' then
      with m as (
        select t.*, public.mm_insurance_tariff_dims(t) as dims
        from public.mm_insurance_tariffs_in_scope(v_act.nomenclature, v_act.code, v_org.organization_type, v_cov.scheme_code, v_sector, v_pcat) t
        where t.verification_status = 'VERIFIED'
          and t.effective_from <= p_date_of_care and (t.effective_until is null or p_date_of_care < t.effective_until)
      )
      select array_agg(m.id order by m.id) into v_ids from m
      where not exists (select 1 from m d where d.dims @> m.dims and not m.dims @> d.dims);

      if coalesce(array_length(v_ids, 1), 0) > 1 then
        v_status := 'CONFLICT';
        v_outcome := 'MULTIPLE_EQUAL_VALID_MATCHES';
        v_conflicts := v_ids;
        v_reason_code := 'TARIFF_CONFLICT';
        v_reason := 'Plusieurs tarifs de référence vérifiés s''appliquent à égalité à cet acte.';
        exit calc;
      elsif coalesce(array_length(v_ids, 1), 0) = 0 then
        v_outcome := case
          when exists (select 1 from public.mm_insurance_tariffs_in_scope(v_act.nomenclature, v_act.code, v_org.organization_type, v_cov.scheme_code, v_sector, v_pcat) t
                       where t.verification_status in ('VERIFIED', 'SUPERSEDED') and t.effective_until <= p_date_of_care) then 'EXPIRED_RULE'
          when exists (select 1 from public.mm_insurance_tariffs_in_scope(v_act.nomenclature, v_act.code, v_org.organization_type, v_cov.scheme_code, v_sector, v_pcat) t
                       where t.verification_status in ('DRAFT', 'UNVERIFIED')) then 'UNVERIFIED_MATCH'
          else 'NO_MATCH' end;
        v_reason_code := 'NO_VERIFIED_TNR';
        v_reason := 'Aucun tarif de référence (TNR) vérifié n''est disponible pour cet acte à la date des soins.';
        exit calc;
      end if;
      select * into v_tariff from public.insurance_tariffs where id = v_ids[1];
      if v_tariff.tariff_type = 'KEY_LETTER' then
        v_tnr := round(v_tariff.key_letter_value * v_tariff.coefficient, 2);
      elsif v_tariff.tariff_type = 'FLAT' then
        v_tnr := v_tariff.flat_amount;
      else
        v_reason_code := 'TARIFF_TYPE_NOT_SUPPORTED';
        v_reason := 'Ce type de tarif de référence n''est pas pris en charge par cette version du moteur.';
        exit calc;
      end if;
      v_sources := v_sources || coalesce(public.mm_insurance_source_json(v_tariff.source_id), '[]'::jsonb);
      v_steps := v_steps || jsonb_build_object('key', 'tnr', 'label', 'TNR', 'value', v_tnr, 'tariff_type', v_tariff.tariff_type,
        'key_letter', v_tariff.key_letter, 'key_letter_value', v_tariff.key_letter_value, 'coefficient', v_tariff.coefficient,
        'flat_amount', v_tariff.flat_amount, 'effective_from', v_tariff.effective_from);
    end if;

    -- 4. the amounts
    if v_rule.rule_type = 'COVERAGE_RATE' then
      v_basis := case v_rule.basis when 'TNR' then least(v_billed, v_tnr) else v_billed end;
      v_org_amt := round(v_basis * v_rule.coverage_rate, 2);
      v_steps := v_steps || jsonb_build_object('key', 'basis', 'label', 'Base de remboursement', 'value', v_basis);
    elsif v_rule.rule_type = 'FIXED_COVERAGE' then
      v_org_amt := v_rule.fixed_coverage_amount;
    else -- NOT_COVERED: an explicit, verified exclusion (never the absence of a rule)
      v_org_amt := 0;
    end if;
    if v_rule.ceiling_amount is not null then v_org_amt := least(v_org_amt, v_rule.ceiling_amount); end if;
    v_org_amt := least(v_org_amt, v_remaining);
    v_pat := v_billed - v_org_amt;
    v_status := 'CALCULATED';
    v_steps := v_steps
      || jsonb_build_object('key', 'organism', 'label', 'Part organisme', 'value', v_org_amt)
      || jsonb_build_object('key', 'patient', 'label', 'Part patient', 'value', v_pat,
           'detail', case when v_layer = 'COMPLEMENTARY' then 'hors part de cet organisme, part de base non déduite' end)
      || jsonb_build_object('key', 'rounding', 'label', 'Arrondi',
           'value', 'au centime, au plus proche (convention du moteur, version ' || c_engine || ')');
  end calc;

  if v_status <> 'CALCULATED' then
    v_basis := null; v_org_amt := null; v_pat := null;
    v_steps := v_steps || jsonb_build_object('key', 'status', 'label', 'Calcul automatique indisponible', 'value', v_reason);
  end if;

  return jsonb_build_object(
    'engine_version', c_engine,
    'status', v_status,
    'match_outcome', v_outcome,
    'reason_code', v_reason_code,
    'reason', v_reason,
    'date_of_care', p_date_of_care,
    'layer', v_layer,
    'billed_amount', v_billed,
    'base_organism_amount', v_base,
    'tnr_amount', v_tnr,
    'reimbursement_basis', v_basis,
    'organism_amount', v_org_amt,
    'patient_amount', v_pat,
    'rule_id', case when v_status = 'CALCULATED' then v_rule.id end,
    'rule', case when v_rule.id is not null then to_jsonb(v_rule) end,
    'tariff_id', v_tariff.id,
    'tariff', case when v_tariff.id is not null then to_jsonb(v_tariff) end,
    'act', case when v_act.id is not null then to_jsonb(v_act) end,
    'act_code', coalesce(v_act.code, v_code),
    'nomenclature', coalesce(v_act.nomenclature, v_nom),
    'conflicting_ids', to_jsonb(v_conflicts),
    'sources', v_sources,
    'prior_authorization', v_prior,
    'tiers_payant', v_tp,
    'inputs', jsonb_build_object('line', p_line, 'context', p_context,
      'coverage', jsonb_build_object('id', v_cov.id, 'coverage_type', v_cov.coverage_type, 'scheme_code', v_cov.scheme_code,
        'organization_id', v_org.id, 'organization_name', v_org.name, 'organization_type', v_org.organization_type,
        'membership_number', v_cov.membership_number, 'beneficiary_type', v_cov.beneficiary_type,
        'valid_from', v_cov.valid_from, 'valid_until', v_cov.valid_until)),
    'explanation', v_steps
  );
end;
$$;

-- The date of care of an invoice: its visit's day (visits.queue_date), else the visit's creation day.
create or replace function public.mm_invoice_date_of_care(p_invoice_id uuid)
returns date
language sql
stable
set search_path = public
as $$
  select coalesce(v.queue_date, v.created_at::date, p.created_at::date)
  from public.payments p left join public.visits v on v.id = p.visit_id
  where p.id = p_invoice_id
$$;

-- ============================================================ 11. RPCs
-- Preview: what the engine answers for these lines of an invoice. Writes nothing.
--   p_lines: [{act_id | nomenclature + act_code, label, billed_amount, base_organism_amount}]
create or replace function public.calculate_insurance_lines(
  p_invoice_id uuid,
  p_coverage_id uuid,
  p_lines jsonb,
  p_payment_mode text default 'TIERS_PAYANT'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_cov public.patient_coverages;
  v_doctor uuid;
  v_date date;
  v_context jsonb;
  v_line jsonb;
  v_calc jsonb;
  v_results jsonb := '[]';
  v_billed numeric := 0;
begin
  if not (public.is_admin() or public.mm_has_permission('billing.view')) then
    raise exception 'not authorized';
  end if;
  select * into v_pay from public.payments where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  perform public.mm_assert_same_clinic(v_pay.clinic_id);
  select * into v_cov from public.patient_coverages where id = p_coverage_id;
  if not found then raise exception 'coverage not found'; end if;
  perform public.mm_assert_same_clinic(v_cov.clinic_id);
  if v_cov.patient_id <> v_pay.patient_id then raise exception 'coverage belongs to another patient'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 100 then
    raise exception 'lines must be a non-empty array (100 at most)';
  end if;
  if p_payment_mode not in ('TIERS_PAYANT', 'PATIENT_PAYS') then raise exception 'unknown payment mode'; end if;

  select doctor_id into v_doctor from public.visits where id = v_pay.visit_id;
  v_date := public.mm_invoice_date_of_care(v_pay.id);
  -- server-side facts only: sector and provider category are not recorded yet, so rules scoped on
  -- them cannot match until they are
  v_context := jsonb_build_object('provider_id', v_doctor, 'payment_mode', p_payment_mode);

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_calc := public.mm_calculate_insurance_line(v_pay.clinic_id, v_cov.id, v_date, v_line, v_context);
    v_billed := v_billed + (v_calc->>'billed_amount')::numeric;
    v_results := v_results || jsonb_build_array(v_calc);
  end loop;
  if v_billed > v_pay.amount then raise exception 'lines total % exceeds the invoice amount %', v_billed, v_pay.amount; end if;

  return jsonb_build_object(
    'date_of_care', v_date,
    'engine_version', '1',
    'lines', v_results,
    'all_calculated', not exists (select 1 from jsonb_array_elements(v_results) r where r->>'status' <> 'CALCULATED'),
    'organism_total', (select case when bool_and(r->>'status' = 'CALCULATED') then sum((r->>'organism_amount')::numeric) end
                       from jsonb_array_elements(v_results) r)
  );
end;
$$;

-- Creates a claim with its lines. Each line is calculated server-side; its amount is the engine's
-- (CALCULATED) or the one entered by hand with a reason (always possible, required otherwise). The
-- claim itself is created by create_insurance_claim, unchanged, for the lines' total: every Stage
-- 1-3.5 check (open invoice, coverage, one claim per organization, cap) applies as before.
--   p_lines: [{act_id | nomenclature + act_code, label, billed_amount, base_organism_amount,
--              invoice_line_id, clinic_act_id, manual_organism_amount, manual_reason}]
create or replace function public.create_insurance_claim_with_lines(
  p_invoice_id uuid,
  p_coverage_id uuid,
  p_lines jsonb,
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
  v_cov public.patient_coverages;
  v_doctor uuid;
  v_date date;
  v_context jsonb;
  v_line jsonb;
  v_n integer;
  v_calc jsonb;
  v_items jsonb := '[]';
  v_item jsonb;
  v_amount numeric;
  v_source text;
  v_reason text;
  v_billed_total numeric := 0;
  v_total numeric := 0;
  v_claim public.insurance_claims;
  v_calc_id uuid;
  v_manual integer := 0;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_pay from public.payments where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  perform public.mm_assert_same_clinic(v_pay.clinic_id);
  select * into v_cov from public.patient_coverages where id = p_coverage_id;
  if not found then raise exception 'coverage not found'; end if;
  perform public.mm_assert_same_clinic(v_cov.clinic_id);
  if v_cov.patient_id <> v_pay.patient_id then raise exception 'coverage belongs to another patient'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 100 then
    raise exception 'lines must be a non-empty array (100 at most)';
  end if;

  select doctor_id into v_doctor from public.visits where id = v_pay.visit_id;
  v_date := public.mm_invoice_date_of_care(v_pay.id);
  v_context := jsonb_build_object('provider_id', v_doctor, 'payment_mode', 'TIERS_PAYANT');

  for v_line, v_n in select value, ordinality from jsonb_array_elements(p_lines) with ordinality loop
    if coalesce(btrim(v_line->>'label'), '') = '' then raise exception 'line %: label is required', v_n; end if;
    if nullif(v_line->>'invoice_line_id', '') is not null and not exists (
      select 1 from public.facture_lignes fl where fl.id = (v_line->>'invoice_line_id')::uuid
        and fl.consultation_id is not distinct from v_pay.consultation_id and v_pay.consultation_id is not null) then
      raise exception 'line %: invoice line does not belong to this invoice', v_n;
    end if;
    if nullif(v_line->>'clinic_act_id', '') is not null and not exists (
      select 1 from public.actes_catalogue a where a.id = (v_line->>'clinic_act_id')::uuid and a.cabinet_id = v_pay.clinic_id) then
      raise exception 'line %: act does not belong to this clinic', v_n;
    end if;

    v_calc := public.mm_calculate_insurance_line(v_pay.clinic_id, v_cov.id, v_date, v_line, v_context);
    v_reason := nullif(btrim(v_line->>'manual_reason'), '');
    if nullif(v_line->>'manual_organism_amount', '') is not null then
      v_amount := round((v_line->>'manual_organism_amount')::numeric, 2);
      if v_reason is null then raise exception 'line %: a manually entered amount needs a reason', v_n; end if;
      if v_amount < 0 or v_amount > (v_calc->>'billed_amount')::numeric then
        raise exception 'line %: the organism amount must be between 0 and the billed amount', v_n;
      end if;
      v_source := 'MANUAL';
      v_manual := v_manual + 1;
    elsif v_calc->>'status' = 'CALCULATED' then
      v_amount := (v_calc->>'organism_amount')::numeric;
      v_source := 'CALCULATED';
      v_reason := null;
    else
      raise exception 'line %: automatic calculation unavailable (%): enter the organism amount manually with a reason',
        v_n, v_calc->>'reason_code';
    end if;
    v_billed_total := v_billed_total + (v_calc->>'billed_amount')::numeric;
    v_total := v_total + v_amount;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'n', v_n, 'line', v_line, 'calc', v_calc, 'amount', v_amount, 'source', v_source, 'reason', v_reason));
  end loop;

  if v_billed_total > v_pay.amount then
    raise exception 'lines total % exceeds the invoice amount %', v_billed_total, v_pay.amount;
  end if;

  -- the claim, through the existing path, for exactly the lines' total
  v_claim := public.create_insurance_claim(p_invoice_id, p_coverage_id, v_total, p_status, p_notes);

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_calc := v_item->'calc';
    insert into public.insurance_calculations (
      clinic_id, claim_id, patient_id, organization_id, invoice_id, coverage_id, line_no, date_of_care,
      calculated_by, engine_version, status, match_outcome, reason_code, reason,
      act_id, act_code, act_label, billed_amount, tnr_amount, reimbursement_basis, organism_amount, patient_amount,
      rule_id, rule_key, rule_version, tariff_id, source_ids, coverage_context, result, manual_override
    ) values (
      v_claim.clinic_id, v_claim.id, v_claim.patient_id, v_claim.organization_id, v_claim.invoice_id, v_claim.coverage_id,
      (v_item->>'n')::integer, v_date, auth.uid(), v_calc->>'engine_version', v_calc->>'status', v_calc->>'match_outcome',
      v_calc->>'reason_code', v_calc->>'reason',
      (v_calc->'act'->>'id')::uuid, v_calc->>'act_code', coalesce(v_calc->'act'->>'label', v_item->'line'->>'label'),
      (v_calc->>'billed_amount')::numeric, (v_calc->>'tnr_amount')::numeric, (v_calc->>'reimbursement_basis')::numeric,
      (v_calc->>'organism_amount')::numeric, (v_calc->>'patient_amount')::numeric,
      (v_calc->>'rule_id')::uuid, case when v_calc->>'rule_id' is not null then v_calc->'rule'->>'rule_key' end,
      case when v_calc->>'rule_id' is not null then (v_calc->'rule'->>'version')::integer end,
      (v_calc->>'tariff_id')::uuid,
      coalesce((select array_agg(distinct (s->>'id')::uuid) from jsonb_array_elements(v_calc->'sources') s), '{}'),
      v_calc->'inputs'->'coverage', v_calc,
      case when v_item->>'source' = 'MANUAL' then jsonb_build_object(
        'amount', (v_item->>'amount')::numeric, 'reason', v_item->>'reason', 'entered_by', auth.uid(), 'entered_at', now(),
        'label', 'Montant saisi manuellement') end
    ) returning id into v_calc_id;

    insert into public.insurance_claim_lines (
      clinic_id, claim_id, patient_id, organization_id, line_no, invoice_line_id, clinic_act_id, act_id, nomenclature, act_code,
      label, date_of_care, billed_amount, tnr_amount, reimbursement_basis, organism_amount, patient_amount, rule_id,
      calculation_status, amount_source, manual_reason, entered_by, calculation_snapshot_id
    ) values (
      v_claim.clinic_id, v_claim.id, v_claim.patient_id, v_claim.organization_id, (v_item->>'n')::integer,
      nullif(v_item->'line'->>'invoice_line_id', '')::uuid, nullif(v_item->'line'->>'clinic_act_id', '')::uuid,
      (v_calc->'act'->>'id')::uuid, v_calc->>'nomenclature', v_calc->>'act_code',
      btrim(v_item->'line'->>'label'), v_date, (v_calc->>'billed_amount')::numeric,
      (v_calc->>'tnr_amount')::numeric, (v_calc->>'reimbursement_basis')::numeric,
      (v_item->>'amount')::numeric, (v_calc->>'billed_amount')::numeric - (v_item->>'amount')::numeric,
      case when v_item->>'source' = 'CALCULATED' then (v_calc->>'rule_id')::uuid end,
      v_calc->>'status', v_item->>'source', v_item->>'reason',
      case when v_item->>'source' = 'MANUAL' then auth.uid() end, v_calc_id
    );
  end loop;

  perform public.write_audit_log('INSURANCE_CLAIM_LINES_RECORDED', 'insurance_claim', v_claim.id, null, null,
    jsonb_build_object('invoice_id', v_pay.id, 'lines', jsonb_array_length(v_items), 'manual_lines', v_manual,
                       'amount_claimed', v_total, 'date_of_care', v_date, 'engine_version', '1'));
  return v_claim;
end;
$$;

-- ============================================================ 12. RLS and grants
alter table public.insurance_rule_sources enable row level security;
alter table public.insurance_coverage_schemes enable row level security;
alter table public.insurance_act_catalog enable row level security;
alter table public.insurance_tariffs enable row level security;
alter table public.insurance_rules enable row level security;
alter table public.insurance_tiers_payant_agreements enable row level security;
alter table public.insurance_calculations enable row level security;
alter table public.insurance_claim_lines enable row level security;

-- national reference data: readable by signed-in users, written only by reviewed migrations / service role
create policy insurance_rule_sources_select on public.insurance_rule_sources for select to authenticated using (true);
create policy insurance_coverage_schemes_select on public.insurance_coverage_schemes for select to authenticated using (true);
create policy insurance_act_catalog_select on public.insurance_act_catalog for select to authenticated using (true);
create policy insurance_tariffs_select on public.insurance_tariffs for select to authenticated using (true);
-- rules: national rows for everyone, a clinic's contract rows for that clinic only
create policy insurance_rules_select on public.insurance_rules for select to authenticated
  using (clinic_id is null or clinic_id = public.current_clinic_id());
-- clinic operational data: same clinic, billing roles, billing.view
create policy insurance_tp_agreements_select on public.insurance_tiers_payant_agreements for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
create policy insurance_tp_agreements_view_permission_gate on public.insurance_tiers_payant_agreements as restrictive for select
  using (public.is_admin() or public.mm_has_permission('billing.view'));
create policy insurance_calculations_select on public.insurance_calculations for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
create policy insurance_calculations_view_permission_gate on public.insurance_calculations as restrictive for select
  using (public.is_admin() or public.mm_has_permission('billing.view'));
create policy insurance_claim_lines_select on public.insurance_claim_lines for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
create policy insurance_claim_lines_view_permission_gate on public.insurance_claim_lines as restrictive for select
  using (public.is_admin() or public.mm_has_permission('billing.view'));

do $$
declare t text;
begin
  foreach t in array array['insurance_rule_sources', 'insurance_coverage_schemes', 'insurance_act_catalog', 'insurance_tariffs',
                           'insurance_rules', 'insurance_tiers_payant_agreements', 'insurance_calculations', 'insurance_claim_lines'] loop
    execute format('create policy %I on public.%I for all using (false) with check (false)', t || '_no_direct_write', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.mm_insurance_reference_guard() from public, anon, authenticated;
revoke all on function public.mm_insurance_sources_guard() from public, anon, authenticated;
revoke all on function public.mm_insurance_calculations_before_insert() from public, anon, authenticated;
revoke all on function public.mm_claim_lines_before_insert() from public, anon, authenticated;
revoke all on function public.mm_claim_lines_total_check() from public, anon, authenticated;
revoke all on function public.mm_insurance_calculation_records_immutable() from public, anon, authenticated;
revoke all on function public.mm_insurance_rules_in_scope(uuid, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mm_insurance_tariffs_in_scope(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mm_insurance_rule_dims(public.insurance_rules) from public, anon, authenticated;
revoke all on function public.mm_insurance_tariff_dims(public.insurance_tariffs) from public, anon, authenticated;
revoke all on function public.mm_insurance_source_json(uuid) from public, anon, authenticated;
revoke all on function public.mm_calculate_insurance_line(uuid, uuid, date, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.mm_invoice_date_of_care(uuid) from public, anon, authenticated;
revoke all on function public.calculate_insurance_lines(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.create_insurance_claim_with_lines(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.calculate_insurance_lines(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.create_insurance_claim_with_lines(uuid, uuid, jsonb, text, text) to authenticated;
grant all on function public.mm_calculate_insurance_line(uuid, uuid, date, jsonb, jsonb) to service_role;
