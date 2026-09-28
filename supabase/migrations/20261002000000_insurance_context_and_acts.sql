-- Stage 4C: insurance context + medical act capture. Still NO regulatory data.
--
-- Gives the (empty) rules engine the inputs it will need, and makes their absence explicit:
--   * patient side: the AMO scheme of a coverage (patient_coverages.scheme_code), a configurable
--     code, no national list; editable through upsert_patient_coverage and versioned like the other
--     coverage fields once a claim uses the coverage.
--   * provider side: cabinets.provider_sector_code and profiles.provider_category_code, nullable
--     configurable codes, changed only through an audited RPC. Specialty is reported, never used to
--     derive a category.
--   * claim lines: one line per medical act (selected from the verified catalog) or a manual line,
--     with a quantity that is stored but never multiplied by the engine.
--   * insurance_claim_contexts: the patient + provider context of each new claim, frozen.
-- The engine answers MANUAL_REQUIRED with an explicit reason whenever a required input is missing.
-- Nothing here touches amounts, invoice_financials or the settlement / rejection ledgers.

-- ============================================================ 1. patient AMO scheme
-- A configurable code: the national reference list (insurance_coverage_schemes) is empty until
-- verified, so the coverage keeps its own code. A code the reference does not know simply matches
-- no rule (and the engine says so).
alter table public.patient_coverages drop constraint if exists patient_coverages_scheme_code_fkey;
alter table public.patient_coverages add constraint patient_coverages_scheme_code_check
  check (scheme_code is null or scheme_code ~ '^[A-Z][A-Z0-9_]*$');

drop function if exists public.upsert_patient_coverage(uuid, uuid, text, uuid, text, text, date, date, boolean, text);

-- Same as Stage 1, plus p_scheme_code, which is always written (null = not provided) and is part of
-- the fields that version a coverage already used by a claim.
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
  p_notes text default null,
  p_scheme_code text default null
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
  v_scheme text := upper(nullif(btrim(p_scheme_code), ''));
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
  -- a scheme only qualifies an AMO coverage
  if p_coverage_type <> 'AMO' then v_scheme := null; end if;
  if v_scheme is not null and v_scheme !~ '^[A-Z][A-Z0-9_]*$' then
    raise exception 'invalid scheme code';
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
       v_before.coverage_type, v_before.organization_id, v_before.membership_number, v_before.beneficiary_type, v_before.scheme_code
     ) is distinct from (p_coverage_type, p_organization_id, v_membership, coalesce(p_beneficiary_type, 'UNKNOWN'), v_scheme) then
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
      valid_from, valid_until, is_active, notes, created_by, scheme_code
    ) values (
      v_patient.cabinet_id, p_patient_id, p_coverage_type, p_organization_id, v_membership,
      coalesce(p_beneficiary_type, 'UNKNOWN'), p_valid_from, p_valid_until, coalesce(p_is_active, true),
      nullif(btrim(p_notes), ''), auth.uid(), v_scheme
    ) returning * into v_row;
  else
    update public.patient_coverages
    set coverage_type = p_coverage_type, organization_id = p_organization_id, membership_number = v_membership,
        beneficiary_type = coalesce(p_beneficiary_type, 'UNKNOWN'), valid_from = p_valid_from,
        valid_until = p_valid_until, is_active = coalesce(p_is_active, true), notes = nullif(btrim(p_notes), ''),
        scheme_code = v_scheme, updated_at = now()
    where id = p_id
    returning * into v_row;
  end if;

  perform public.write_audit_log('PATIENT_COVERAGE_SAVED', 'patient_coverage', v_row.id,
    case when v_before.id is null then null else to_jsonb(v_before) end, to_jsonb(v_row), null);
  return v_row;
end;
$$;
revoke all on function public.upsert_patient_coverage(uuid, uuid, text, uuid, text, text, date, date, boolean, text, text) from public, anon;
grant execute on function public.upsert_patient_coverage(uuid, uuid, text, uuid, text, text, date, date, boolean, text, text) to authenticated, service_role;

-- ============================================================ 2. provider context
-- Sector: property of the establishment. Category: property of the practitioner. Both are
-- configurable codes (no national enum yet), null until configured.
alter table public.cabinets add column if not exists provider_sector_code text
  constraint cabinets_provider_sector_code_check check (provider_sector_code is null or provider_sector_code ~ '^[A-Z][A-Z0-9_]*$');
alter table public.profiles add column if not exists provider_category_code text
  constraint profiles_provider_category_code_check check (provider_category_code is null or provider_category_code ~ '^[A-Z][A-Z0-9_]*$');

-- They change only through set_insurance_provider_context (audited), never through the direct
-- profile / cabinet updates the settings page does for the other columns.
create or replace function public.mm_provider_context_guard()
returns trigger
language plpgsql
as $$
declare
  v_changed boolean;
begin
  if current_setting('mm.provider_context_write', true) is not distinct from 'on' then return new; end if;
  -- each table has its own column (field access is resolved at run time, so no shared expression)
  if tg_table_name = 'cabinets' then
    v_changed := new.provider_sector_code is distinct from old.provider_sector_code;
  else
    v_changed := new.provider_category_code is distinct from old.provider_category_code;
  end if;
  if v_changed then
    raise exception 'insurance provider context is changed through set_insurance_provider_context only';
  end if;
  return new;
end;
$$;
create trigger trg_cabinets_provider_context_guard before update on public.cabinets
  for each row execute function public.mm_provider_context_guard();
create trigger trg_profiles_provider_context_guard before update on public.profiles
  for each row execute function public.mm_provider_context_guard();

-- The caller's cabinet sector and their own practitioner category ('' / null = not configured).
create or replace function public.set_insurance_provider_context(p_sector_code text, p_category_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_sector text := upper(nullif(btrim(p_sector_code), ''));
  v_category text := upper(nullif(btrim(p_category_code), ''));
  v_before jsonb;
begin
  if auth.uid() is null or v_clinic is null or public.current_role() not in ('doctor', 'admin') then
    raise exception 'not authorized';
  end if;
  if v_sector is not null and v_sector !~ '^[A-Z][A-Z0-9_]*$' then raise exception 'invalid sector code'; end if;
  if v_category is not null and v_category !~ '^[A-Z][A-Z0-9_]*$' then raise exception 'invalid category code'; end if;

  select jsonb_build_object('sector', c.provider_sector_code, 'category', p.provider_category_code) into v_before
  from public.cabinets c, public.profiles p where c.id = v_clinic and p.id = auth.uid();

  perform set_config('mm.provider_context_write', 'on', true);
  update public.cabinets set provider_sector_code = v_sector where id = v_clinic;
  update public.profiles set provider_category_code = v_category where id = auth.uid();
  perform set_config('mm.provider_context_write', 'off', true);

  perform public.write_audit_log('INSURANCE_PROVIDER_CONTEXT_SET', 'cabinet', v_clinic, v_before,
    jsonb_build_object('sector', v_sector, 'category', v_category), jsonb_build_object('practitioner_id', auth.uid()));
  return jsonb_build_object('sector', v_sector, 'category', v_category);
end;
$$;

-- The provider side of an invoice: its establishment and the practitioner of its visit.
create or replace function public.mm_insurance_provider_context(p_invoice_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'establishment_id', p.clinic_id,
    'sector', c.provider_sector_code,
    'provider_id', v.doctor_id,
    'provider_category', pr.provider_category_code,
    'specialty', pr.specialite)
  from public.payments p
  join public.cabinets c on c.id = p.clinic_id
  left join public.visits v on v.id = p.visit_id
  left join public.profiles pr on pr.id = v.doctor_id
  where p.id = p_invoice_id
$$;

-- ============================================================ 3. quantity
-- Stored on the line and in its snapshot; engine version 1 never multiplies by it.
alter table public.insurance_claim_lines add column if not exists quantity integer not null default 1
  constraint insurance_claim_lines_quantity_check check (quantity > 0);
alter table public.insurance_calculations add column if not exists quantity integer not null default 1
  constraint insurance_calculations_quantity_check check (quantity > 0);

-- ============================================================ 4. claim context snapshot
-- The patient coverage and provider context as they were when the claim was created. Later
-- changes to the coverage, the cabinet or the practitioner never reach it.
create table public.insurance_claim_contexts (
  claim_id uuid primary key,
  clinic_id uuid not null references public.cabinets(id) on delete cascade,
  patient_id uuid not null,
  organization_id uuid not null,
  date_of_care date not null,
  coverage jsonb not null,
  provider jsonb not null,
  missing_context text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint insurance_claim_contexts_claim_fkey
    foreign key (claim_id, clinic_id, patient_id, organization_id)
    references public.insurance_claims(id, clinic_id, patient_id, organization_id)
);

create or replace function public.mm_insurance_claim_contexts_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.insurance_claims where id = new.claim_id and created_at = now()) then
    raise exception 'a claim context is recorded with its claim only';
  end if;
  return new;
end;
$$;
create trigger trg_insurance_claim_contexts_before_insert before insert on public.insurance_claim_contexts
  for each row execute function public.mm_insurance_claim_contexts_before_insert();
create trigger trg_insurance_claim_contexts_immutable before update or delete on public.insurance_claim_contexts
  for each row execute function public.mm_insurance_calculation_records_immutable();

alter table public.insurance_claim_contexts enable row level security;
create policy insurance_claim_contexts_select on public.insurance_claim_contexts for select
  using (clinic_id = public.current_clinic_id() and public.current_role() = any (array['admin', 'secretary', 'doctor']));
create policy insurance_claim_contexts_view_permission_gate on public.insurance_claim_contexts as restrictive for select
  using (public.is_admin() or public.mm_has_permission('billing.view'));
create policy insurance_claim_contexts_no_direct_write on public.insurance_claim_contexts for all using (false) with check (false);
revoke all on public.insurance_claim_contexts from anon;
revoke insert, update, delete, truncate on public.insurance_claim_contexts from authenticated;
grant select on public.insurance_claim_contexts to authenticated;
grant all on public.insurance_claim_contexts to service_role;

-- ============================================================ 5. engine (version 2)
-- Version 1 plus: the required context (AMO scheme for the base layer, provider sector and
-- category) must be present, each missing input is listed in missing_context, the quantity is
-- recorded but a quantity above 1 is never calculated, and the tiers-payant answer reports the
-- establishment / practitioner / organization context and whether a verified agreement is on file,
-- without ever deducing eligibility from it.
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
  c_engine constant text := '2';
  v_cov public.patient_coverages;
  v_org public.insurance_organizations;
  v_layer text;
  v_billed numeric;
  v_qty integer;
  v_base numeric;
  v_remaining numeric;
  v_sector text := nullif(btrim(p_context->>'sector'), '');
  v_pcat text := nullif(btrim(p_context->>'provider_category'), '');
  v_provider uuid := nullif(p_context->>'provider_id', '')::uuid;
  v_missing text[] := '{}';
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
  v_tp jsonb;
  v_tp_context jsonb;
  v_agreement uuid;
  v_on_file uuid;
  v_sources jsonb := '[]';
  v_steps jsonb := '[]';
begin
  v_billed := round((p_line->>'billed_amount')::numeric, 2);
  if v_billed is null or v_billed <= 0 then raise exception 'billed amount must be positive'; end if;
  v_qty := coalesce(nullif(p_line->>'quantity', '')::integer, 1);
  if v_qty < 1 or v_qty > 999 then raise exception 'quantity must be between 1 and 999'; end if;
  if p_date_of_care is null then raise exception 'date of care is required'; end if;

  select * into v_cov from public.patient_coverages where id = p_coverage_id and clinic_id = p_clinic_id;
  if not found then raise exception 'coverage not found'; end if;
  if v_cov.coverage_type = 'NONE' then raise exception 'coverage is not an insurance coverage'; end if;
  select * into v_org from public.insurance_organizations where id = v_cov.organization_id;
  v_layer := case when v_cov.coverage_type = 'AMO' then 'BASE' else 'COMPLEMENTARY' end;
  v_base := round(nullif(p_line->>'base_organism_amount', '')::numeric, 2);
  if v_base is not null and (v_base < 0 or v_base > v_billed) then
    raise exception 'base organism amount must be between 0 and the billed amount';
  end if;

  -- the act as given by the caller (an explicit selection; nothing is ever inferred from text)
  if nullif(p_line->>'act_id', '') is not null then
    select nomenclature, code into v_nom, v_code from public.insurance_act_catalog where id = (p_line->>'act_id')::uuid;
    if not found then raise exception 'reference act not found'; end if;
  else
    v_nom := upper(nullif(btrim(p_line->>'nomenclature'), ''));
    v_code := nullif(btrim(p_line->>'act_code'), '');
  end if;

  -- every missing input, reported whatever stops the calculation first
  if v_nom is null or v_code is null then v_missing := v_missing || 'ACT'::text; end if;
  if v_layer = 'BASE' and v_cov.scheme_code is null then v_missing := v_missing || 'SCHEME'::text; end if;
  if v_sector is null then v_missing := v_missing || 'PROVIDER_SECTOR'::text; end if;
  if v_pcat is null then v_missing := v_missing || 'PROVIDER_CATEGORY'::text; end if;

  -- tiers-payant context: reported, never turned into eligibility by itself
  select a.id into v_on_file from public.insurance_tiers_payant_agreements a
  where a.clinic_id = p_clinic_id and a.organization_id = v_org.id and a.verification_status = 'VERIFIED'
    and a.effective_from <= p_date_of_care and (a.effective_until is null or p_date_of_care < a.effective_until)
    and (a.provider_id is null or a.provider_id = v_provider)
  order by a.id limit 1;
  v_tp_context := jsonb_build_object('establishment_id', p_clinic_id, 'provider_id', v_provider,
    'organization_id', v_org.id, 'verified_agreement_on_file', v_on_file is not null);
  v_tp := jsonb_build_object('status', 'UNVERIFIED',
    'reason', 'Aucune règle vérifiée ne détermine l''éligibilité au tiers payant.') || v_tp_context;

  v_steps := v_steps || jsonb_build_object('key', 'billed', 'label', 'Honoraires', 'value', v_billed, 'quantity', v_qty);

  <<calc>>
  begin
    if (v_cov.valid_from is not null and v_cov.valid_from > p_date_of_care)
       or (v_cov.valid_until is not null and v_cov.valid_until < p_date_of_care) then
      v_reason_code := 'COVERAGE_NOT_VALID_ON_DATE';
      v_reason := 'La couverture enregistrée n''était pas valide à la date des soins.';
      exit calc;
    end if;
    if v_nom is null or v_code is null then
      v_reason_code := 'ACT_NOT_IDENTIFIED';
      v_reason := 'Aucune règle d''assurance vérifiée n''est disponible pour cet acte à la date des soins (acte non rattaché à la nomenclature de référence).';
      exit calc;
    end if;
    -- 1. the act, as known to the verified reference catalog on the date of care. Resolved before the
    --    context checks: an explicitly selected act stays identified whatever else is missing.
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

    if v_layer = 'BASE' and v_cov.scheme_code is null then
      v_reason_code := 'SCHEME_MISSING';
      v_reason := 'Régime AMO non renseigné.';
      exit calc;
    end if;
    if v_layer = 'BASE' and not exists (select 1 from public.insurance_coverage_schemes where code = v_cov.scheme_code) then
      v_reason_code := 'SCHEME_NOT_IN_REFERENCE';
      v_reason := 'Régime AMO absent du référentiel d''assurance vérifié.';
      exit calc;
    end if;
    if v_sector is null then
      v_reason_code := 'PROVIDER_SECTOR_MISSING';
      v_reason := 'Secteur du cabinet non renseigné pour l''assurance.';
      exit calc;
    end if;
    if v_pcat is null then
      v_reason_code := 'PROVIDER_CATEGORY_MISSING';
      v_reason := 'Catégorie du praticien non renseignée pour l''assurance.';
      exit calc;
    end if;

    if v_qty > 1 then
      v_reason_code := 'QUANTITY_NOT_SUPPORTED';
      v_reason := 'Quantité supérieure à 1 : le calcul automatique n''est pas pris en charge par cette version du moteur.';
      exit calc;
    end if;

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
    v_tp := v_tp || v_tp_context;

    if v_layer = 'COMPLEMENTARY' and v_base is null then
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
    'missing_context', to_jsonb(v_missing),
    'date_of_care', p_date_of_care,
    'layer', v_layer,
    'quantity', v_qty,
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

-- ============================================================ 6. RPCs
-- The inputs the engine would use for this invoice and coverage, and what is missing.
create or replace function public.get_insurance_context(p_invoice_id uuid, p_coverage_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_cov public.patient_coverages;
  v_org public.insurance_organizations;
  v_provider jsonb;
  v_missing text[] := '{}';
begin
  if not (public.is_admin() or public.mm_has_permission('billing.view')) then raise exception 'not authorized'; end if;
  select * into v_pay from public.payments where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  perform public.mm_assert_same_clinic(v_pay.clinic_id);
  select * into v_cov from public.patient_coverages where id = p_coverage_id;
  if not found then raise exception 'coverage not found'; end if;
  perform public.mm_assert_same_clinic(v_cov.clinic_id);
  if v_cov.patient_id <> v_pay.patient_id then raise exception 'coverage belongs to another patient'; end if;
  select * into v_org from public.insurance_organizations where id = v_cov.organization_id;
  v_provider := public.mm_insurance_provider_context(v_pay.id);

  if v_cov.coverage_type = 'AMO' and v_cov.scheme_code is null then v_missing := v_missing || 'SCHEME'::text; end if;
  if v_provider->>'sector' is null then v_missing := v_missing || 'PROVIDER_SECTOR'::text; end if;
  if v_provider->>'provider_category' is null then v_missing := v_missing || 'PROVIDER_CATEGORY'::text; end if;

  return jsonb_build_object(
    'date_of_care', public.mm_invoice_date_of_care(v_pay.id),
    'patient', jsonb_build_object('coverage_type', v_cov.coverage_type, 'scheme_code', v_cov.scheme_code,
      'organization_id', v_org.id, 'organization_name', v_org.name, 'organization_type', v_org.organization_type,
      'membership_number', v_cov.membership_number, 'beneficiary_type', v_cov.beneficiary_type,
      'valid_from', v_cov.valid_from, 'valid_until', v_cov.valid_until),
    'provider', v_provider,
    'missing_context', to_jsonb(v_missing));
end;
$$;

-- Verified reference acts in force on the invoice's date of care (empty until real data exists).
create or replace function public.search_insurance_acts(p_invoice_id uuid, p_query text default null)
returns table (id uuid, nomenclature text, code text, label text, category text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
  v_date date;
  v_q text := nullif(btrim(p_query), '');
begin
  if not (public.is_admin() or public.mm_has_permission('billing.view')) then raise exception 'not authorized'; end if;
  select * into v_pay from public.payments p where p.id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  perform public.mm_assert_same_clinic(v_pay.clinic_id);
  v_date := public.mm_invoice_date_of_care(v_pay.id);
  return query
    select a.id, a.nomenclature, a.code, a.label, a.category
    from public.insurance_act_catalog a
    where a.verification_status = 'VERIFIED'
      and a.effective_from <= v_date and (a.effective_until is null or v_date < a.effective_until)
      and (v_q is null or a.code ilike '%' || v_q || '%' or a.label ilike '%' || v_q || '%')
    order by a.nomenclature, a.code
    limit 50;
end;
$$;

-- Preview: as in Stage 4B, the provider context now read server-side.
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

  v_date := public.mm_invoice_date_of_care(v_pay.id);
  v_context := public.mm_insurance_provider_context(v_pay.id) || jsonb_build_object('payment_mode', p_payment_mode);

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_calc := public.mm_calculate_insurance_line(v_pay.clinic_id, v_cov.id, v_date, v_line, v_context);
    v_billed := v_billed + (v_calc->>'billed_amount')::numeric;
    v_results := v_results || jsonb_build_array(v_calc);
  end loop;
  if v_billed > v_pay.amount then raise exception 'lines total % exceeds the invoice amount %', v_billed, v_pay.amount; end if;

  return jsonb_build_object(
    'date_of_care', v_date,
    'engine_version', '2',
    'context', v_context,
    'lines', v_results,
    'all_calculated', not exists (select 1 from jsonb_array_elements(v_results) r where r->>'status' <> 'CALCULATED'),
    'organism_total', (select case when bool_and(r->>'status' = 'CALCULATED') then sum((r->>'organism_amount')::numeric) end
                       from jsonb_array_elements(v_results) r)
  );
end;
$$;

-- Claim with its lines, as in Stage 4B, plus: provider context read server-side, quantity stored,
-- the reference act recorded on the line only when the engine resolved a VERIFIED one (a typed or
-- unverified code is never presented as an identified act), and the claim's context frozen.
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
  v_org public.insurance_organizations;
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
  v_missing text[] := '{}';
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
  select * into v_org from public.insurance_organizations where id = v_cov.organization_id;

  v_date := public.mm_invoice_date_of_care(v_pay.id);
  v_context := public.mm_insurance_provider_context(v_pay.id) || jsonb_build_object('payment_mode', 'TIERS_PAYANT');

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
    v_missing := v_missing || array(select jsonb_array_elements_text(v_calc->'missing_context'));
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

  insert into public.insurance_claim_contexts (claim_id, clinic_id, patient_id, organization_id, date_of_care, coverage, provider, missing_context)
  values (v_claim.id, v_claim.clinic_id, v_claim.patient_id, v_claim.organization_id, v_date,
    jsonb_build_object('coverage_id', v_cov.id, 'coverage_type', v_cov.coverage_type, 'scheme_code', v_cov.scheme_code,
      'organization_id', v_org.id, 'organization_name', v_org.name, 'organization_type', v_org.organization_type,
      'membership_number', v_cov.membership_number, 'beneficiary_type', v_cov.beneficiary_type,
      'valid_from', v_cov.valid_from, 'valid_until', v_cov.valid_until),
    v_context - 'payment_mode',
    coalesce((select array_agg(distinct m) from unnest(v_missing) m), '{}'));

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_calc := v_item->'calc';
    insert into public.insurance_calculations (
      clinic_id, claim_id, patient_id, organization_id, invoice_id, coverage_id, line_no, date_of_care,
      calculated_by, engine_version, status, match_outcome, reason_code, reason,
      act_id, act_code, act_label, quantity, billed_amount, tnr_amount, reimbursement_basis, organism_amount, patient_amount,
      rule_id, rule_key, rule_version, tariff_id, source_ids, coverage_context, result, manual_override
    ) values (
      v_claim.clinic_id, v_claim.id, v_claim.patient_id, v_claim.organization_id, v_claim.invoice_id, v_claim.coverage_id,
      (v_item->>'n')::integer, v_date, auth.uid(), v_calc->>'engine_version', v_calc->>'status', v_calc->>'match_outcome',
      v_calc->>'reason_code', v_calc->>'reason',
      (v_calc->'act'->>'id')::uuid, v_calc->'act'->>'code', coalesce(v_calc->'act'->>'label', v_item->'line'->>'label'),
      (v_calc->>'quantity')::integer,
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
      label, date_of_care, quantity, billed_amount, tnr_amount, reimbursement_basis, organism_amount, patient_amount, rule_id,
      calculation_status, amount_source, manual_reason, entered_by, calculation_snapshot_id
    ) values (
      v_claim.clinic_id, v_claim.id, v_claim.patient_id, v_claim.organization_id, (v_item->>'n')::integer,
      nullif(v_item->'line'->>'invoice_line_id', '')::uuid, nullif(v_item->'line'->>'clinic_act_id', '')::uuid,
      (v_calc->'act'->>'id')::uuid, v_calc->'act'->>'nomenclature', v_calc->'act'->>'code',
      btrim(v_item->'line'->>'label'), v_date, (v_calc->>'quantity')::integer, (v_calc->>'billed_amount')::numeric,
      (v_calc->>'tnr_amount')::numeric, (v_calc->>'reimbursement_basis')::numeric,
      (v_item->>'amount')::numeric, (v_calc->>'billed_amount')::numeric - (v_item->>'amount')::numeric,
      case when v_item->>'source' = 'CALCULATED' then (v_calc->>'rule_id')::uuid end,
      v_calc->>'status', v_item->>'source', v_item->>'reason',
      case when v_item->>'source' = 'MANUAL' then auth.uid() end, v_calc_id
    );
  end loop;

  perform public.write_audit_log('INSURANCE_CLAIM_LINES_RECORDED', 'insurance_claim', v_claim.id, null, null,
    jsonb_build_object('invoice_id', v_pay.id, 'lines', jsonb_array_length(v_items), 'manual_lines', v_manual,
                       'amount_claimed', v_total, 'date_of_care', v_date, 'engine_version', '2'));
  return v_claim;
end;
$$;

-- ============================================================ 7. grants
revoke all on function public.mm_provider_context_guard() from public, anon, authenticated;
revoke all on function public.mm_insurance_claim_contexts_before_insert() from public, anon, authenticated;
revoke all on function public.mm_insurance_provider_context(uuid) from public, anon, authenticated;
revoke all on function public.mm_calculate_insurance_line(uuid, uuid, date, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.set_insurance_provider_context(text, text) from public, anon;
revoke all on function public.get_insurance_context(uuid, uuid) from public, anon;
revoke all on function public.search_insurance_acts(uuid, text) from public, anon;
revoke all on function public.calculate_insurance_lines(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.create_insurance_claim_with_lines(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.set_insurance_provider_context(text, text) to authenticated;
grant execute on function public.get_insurance_context(uuid, uuid) to authenticated;
grant execute on function public.search_insurance_acts(uuid, text) to authenticated;
grant execute on function public.calculate_insurance_lines(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.create_insurance_claim_with_lines(uuid, uuid, jsonb, text, text) to authenticated;
grant all on function public.mm_calculate_insurance_line(uuid, uuid, date, jsonb, jsonb) to service_role;
