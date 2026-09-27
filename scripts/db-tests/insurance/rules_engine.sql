-- Stage 4B (empty engine) matrix. Throwaway local database only.
-- Every rule / tariff / act / source below is a TEST-ONLY fixture: fictitious codes (TESTNOM, T-*),
-- fictitious rates, a source named SRC-TEST-*. None of it exists in any migration.
\set ON_ERROR_STOP 1
\set QUIET 1
create schema t;
grant usage on schema t to authenticated, anon;
create table t.results (n serial, label text, ok boolean, detail text);
grant all on t.results to authenticated, anon; grant usage on sequence t.results_n_seq to authenticated, anon;
create function t.check(p_ok boolean, p_label text, p_detail text default null) returns void language sql as
  $$ insert into t.results (label, ok, detail) values (p_label, coalesce(p_ok, false), p_detail) $$;
create function t.fails(p_sql text, p_pattern text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  perform t.check(false, p_label, 'did not fail');
exception when others then
  perform t.check(sqlerrm ~* p_pattern, p_label, sqlerrm);
end $$;
create function t.as_(p uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', p::text, false) $$;
-- first line of a preview, as the current user
create function t.prev(p_inv uuid, p_cov uuid, p_line jsonb) returns jsonb language sql as
  $$ select public.calculate_insurance_lines(p_inv, p_cov, jsonb_build_array(p_line))->'lines'->0 $$;
create function t.rec(p uuid) returns jsonb language sql security definer as $$
  select jsonb_build_object('total', invoice_total, 'patient_paid', patient_paid, 'patient_due', patient_due,
    'org_share', organism_share, 'org_received', organism_received, 'org_due', organism_due,
    'unresolved', rejected_unresolved, 'status', reconciliation_status)
  from public.invoice_financials where invoice_id = p $$;
create function t.lines(p_claim uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(l) order by line_no), '[]') from public.insurance_claim_lines l where claim_id = p_claim $$;
create function t.snap(p_claim uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by line_no), '[]') from public.insurance_calculations c where claim_id = p_claim $$;
create function t.ncalc() returns bigint language sql security definer as $$ select count(*) from public.insurance_calculations $$;
create function t.claimed(p uuid) returns numeric language sql security definer as $$ select amount_claimed from insurance_claims where id = p $$;
create function t.rules_md5() returns text language sql security definer as $$
  select md5(coalesce(string_agg(to_jsonb(r)::text, '|' order by id), '')) from public.insurance_rules r $$;
grant execute on all functions in schema t to authenticated, anon;

\set cA '\'aaaaaaaa-0000-4000-8000-000000000000\''
\set cB '\'bbbbbbbb-0000-4000-8000-000000000000\''
\set docA '\'a0000000-0000-4000-8000-000000000001\''
\set secA '\'a0000000-0000-4000-8000-000000000002\''
\set secB '\'b0000000-0000-4000-8000-000000000002\''
\set pA1 '\'a1000000-0000-4000-8000-000000000001\''
\set pA2 '\'a1000000-0000-4000-8000-000000000002\''

-- invoices of 300 / 500, visits at the cashier
select pg_temp.billing_visit(('d6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                             ('e6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                             :cA, :pA1, :docA, amt, n)
from (values (1, 300), (2, 300), (3, 300), (4, 300), (5, 300), (6, 500), (7, 300), (8, 300), (9, 300), (10, 300), (11, 300)) v(n, amt);
select pg_temp.billing_visit('d6000000-0000-4000-8000-000000000020', 'e6000000-0000-4000-8000-000000000020', :cA, :pA2, :docA, 300, 20);
-- the visits' day = date of care (fixture: fixed dates)
update visits set queue_date = '2026-09-27' where id::text like 'd6000000%';
update visits set queue_date = '2025-06-15' where id = 'd6000000-0000-4000-8000-000000000002';
\set i1 '\'e6000000-0000-4000-8000-000000000001\''
\set i2 '\'e6000000-0000-4000-8000-000000000002\''
\set i3 '\'e6000000-0000-4000-8000-000000000003\''
\set i4 '\'e6000000-0000-4000-8000-000000000004\''
\set i5 '\'e6000000-0000-4000-8000-000000000005\''
\set i6 '\'e6000000-0000-4000-8000-000000000006\''
\set i7 '\'e6000000-0000-4000-8000-000000000007\''
\set i8 '\'e6000000-0000-4000-8000-000000000008\''
\set i9 '\'e6000000-0000-4000-8000-000000000009\''
\set i10 '\'e6000000-0000-4000-8000-000000000010\''
\set i11 '\'e6000000-0000-4000-8000-000000000011\''
\set i20 '\'e6000000-0000-4000-8000-000000000020\''

set role authenticated;
select t.as_(:secA);
select id as orga from upsert_insurance_organization(null, 'Organisme Test Base', 'AMO_MANAGER') \gset
select id as orgb from upsert_insurance_organization(null, 'Mutuelle Test', 'MUTUELLE') \gset
select id as cova from upsert_patient_coverage(null, :pA1, 'AMO', :'orga', 'T-123', 'ASSURE') \gset
select id as covb from upsert_patient_coverage(null, :pA1, 'COMPLEMENTARY', :'orgb', 'T-456', 'ASSURE') \gset
select id as cova2 from upsert_patient_coverage(null, :pA2, 'AMO', :'orga', 'T-789', 'ASSURE') \gset

-- ================================================================ 0. empty engine (zero reference data)
select t.prev(:i1, :'cova', '{"label":"Consultation","billed_amount":300}') as r \gset e0_
select t.check((:'e0_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'e0_r'::jsonb)->'organism_amount' = 'null'
  and (:'e0_r'::jsonb)->'tnr_amount' = 'null' and (:'e0_r'::jsonb)->'reimbursement_basis' = 'null'
  and (:'e0_r'::jsonb)->>'reason' like 'Aucune règle d''assurance vérifiée n''est disponible pour cet acte à la date des soins%',
  '0. empty engine: MANUAL_REQUIRED, no amount, no TNR, the canonical reason', :'e0_r');
select t.prev(:i1, :'cova', '{"nomenclature":"NGAP","act_code":"C","label":"Consultation","billed_amount":300}') as r \gset e0b_
select t.check((:'e0b_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'e0b_r'::jsonb)->>'match_outcome' = 'NO_MATCH'
  and (:'e0b_r'::jsonb)->'organism_amount' = 'null' and (:'e0b_r'::jsonb)->>'prior_authorization' = 'UNKNOWN'
  and (:'e0b_r'::jsonb)->'tiers_payant'->>'status' = 'UNVERIFIED',
  '0. empty engine: a real-looking act code is still MANUAL_REQUIRED (prior auth UNKNOWN, tiers payant UNVERIFIED)', :'e0b_r');
select t.check((select count(*) from insurance_rules) + (select count(*) from insurance_tariffs) + (select count(*) from insurance_act_catalog)
  + (select count(*) from insurance_rule_sources) + (select count(*) from insurance_coverage_schemes) = 0,
  '0. production reference tables are empty');

-- ================================================================ TEST-ONLY fixtures
reset role;
insert into insurance_rule_sources (id, source_code, issuing_body, title, document_type, publication_date, effective_date, version, checksum, retrieved_at, notes)
values ('50000000-0000-4000-8000-000000000001', 'SRC-TEST-001', 'TEST', 'Fixture de test (fictive)', 'TEST_FIXTURE', '2020-01-01', '2020-01-01', 'v1',
        encode(sha256('stage4b test fixture'), 'hex'), now(), 'test only'),
       ('50000000-0000-4000-8000-000000000002', 'SRC-TEST-NOTARCHIVED', 'TEST', 'Fixture sans archive', 'TEST_FIXTURE', null, null, null, null, null, 'test only');
insert into insurance_coverage_schemes (code, label, coverage_layer, notes) values ('TEST_SCHEME', 'Régime de test (fictif)', 'BASE', 'test only');
update patient_coverages set scheme_code = 'TEST_SCHEME' where id in (:'cova', :'cova2');
\set src '\'50000000-0000-4000-8000-000000000001\''
\set rev '\'a0000000-0000-4000-8000-000000000001\''
insert into insurance_act_catalog (nomenclature, code, label, category, effective_from, source_id, verification_status, verified_by, verified_at)
select 'TESTNOM', c, 'Acte test ' || c, cat, '2020-01-01', :src, 'VERIFIED', :rev, now()
from (values ('T-CONS', 'TEST_CONSULTATION'), ('T-NORULE', 'TEST_CONSULTATION_X'), ('T-UNV', 'TEST_X1'), ('T-EXP', 'TEST_X2'),
             ('T-CONF', 'TEST_X3'), ('T-SPEC', 'TEST_X4'), ('T-FUT', 'TEST_X5'), ('T-KEY', 'TEST_X6'), ('T-TP', 'TEST_X7'),
             ('T-TPA', 'TEST_X8'), ('T-NOTNR', 'TEST_X9')) v(c, cat);
-- TNR: flat 200 on T-CONS, key letter 10 x 15 = 150 on T-KEY, flat 100 on T-TP / T-TPA
insert into insurance_tariffs (nomenclature, act_code, tariff_type, flat_amount, key_letter, key_letter_value, coefficient, effective_from, source_id, verification_status, verified_by, verified_at)
values ('TESTNOM', 'T-CONS', 'FLAT', 200, null, null, null, '2020-01-01', :src, 'VERIFIED', :rev, now()),
       ('TESTNOM', 'T-KEY', 'KEY_LETTER', null, 'TK', 10, 15, '2020-01-01', :src, 'VERIFIED', :rev, now()),
       ('TESTNOM', 'T-TP', 'FLAT', 100, null, null, null, '2020-01-01', :src, 'VERIFIED', :rev, now()),
       ('TESTNOM', 'T-TPA', 'FLAT', 100, null, null, null, '2020-01-01', :src, 'VERIFIED', :rev, now());
-- rules (fictitious rates)
insert into insurance_rules (id, rule_key, version, coverage_layer, nomenclature, act_code, act_category, organization_type, scheme_code,
  rule_type, basis, coverage_rate, requires_prior_authorization, tiers_payant_eligibility, effective_from, effective_until,
  source_id, verification_status, verified_by, verified_at)
values
  ('70000000-0000-4000-8000-000000000001', 'TEST-CONS', 1, 'BASE', 'TESTNOM', 'T-CONS', null, null, null, 'COVERAGE_RATE', 'TNR', 0.5, false, 'UNKNOWN', '2020-01-01', '2026-01-01', :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000002', 'TEST-CONS', 2, 'BASE', 'TESTNOM', 'T-CONS', null, null, null, 'COVERAGE_RATE', 'TNR', 0.6, false, 'UNKNOWN', '2026-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000003', 'TEST-UNV', 1, 'BASE', 'TESTNOM', 'T-UNV', null, null, null, 'COVERAGE_RATE', 'TNR', 0.5, false, 'UNKNOWN', '2020-01-01', null, :src, 'UNVERIFIED', null, null),
  ('70000000-0000-4000-8000-000000000004', 'TEST-EXP', 1, 'BASE', 'TESTNOM', 'T-EXP', null, null, null, 'COVERAGE_RATE', 'BILLED', 0.5, false, 'UNKNOWN', '2020-01-01', '2024-01-01', :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000005', 'TEST-CONF-A', 1, 'BASE', 'TESTNOM', 'T-CONF', null, 'AMO_MANAGER', null, 'COVERAGE_RATE', 'BILLED', 0.5, false, 'UNKNOWN', '2020-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000006', 'TEST-CONF-B', 1, 'BASE', 'TESTNOM', 'T-CONF', null, null, 'TEST_SCHEME', 'COVERAGE_RATE', 'BILLED', 0.4, false, 'UNKNOWN', '2020-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000007', 'TEST-SPEC-GEN', 1, 'BASE', null, null, 'TEST_X4', null, null, 'COVERAGE_RATE', 'BILLED', 0.3, false, 'UNKNOWN', '2020-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000009', 'TEST-FUT', 1, 'BASE', 'TESTNOM', 'T-FUT', null, null, null, 'COVERAGE_RATE', 'BILLED', 0.5, false, 'UNKNOWN', '2027-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000010', 'TEST-KEY', 1, 'BASE', 'TESTNOM', 'T-KEY', null, null, null, 'COVERAGE_RATE', 'TNR', 0.5, true, 'ELIGIBLE', '2020-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000011', 'TEST-TP', 1, 'BASE', 'TESTNOM', 'T-TP', null, null, null, 'COVERAGE_RATE', 'TNR', 0.5, false, 'REQUIRES_AGREEMENT', '2020-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000012', 'TEST-TPA', 1, 'BASE', 'TESTNOM', 'T-TPA', null, null, null, 'COVERAGE_RATE', 'TNR', 0.5, false, 'REQUIRES_AGREEMENT', '2020-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000013', 'TEST-COMP', 1, 'COMPLEMENTARY', 'TESTNOM', 'T-CONS', null, null, null, 'COVERAGE_RATE', 'TNR', 0.4, false, 'UNKNOWN', '2020-01-01', null, :src, 'VERIFIED', :rev, now()),
  ('70000000-0000-4000-8000-000000000014', 'TEST-NOTNR', 1, 'BASE', 'TESTNOM', 'T-NOTNR', null, null, null, 'COVERAGE_RATE', 'TNR', 0.5, false, 'UNKNOWN', '2020-01-01', null, :src, 'VERIFIED', :rev, now());
-- TEST-SPEC-ACT: a fixed amount of 80, scoped on the act (more specific than TEST-SPEC-GEN)
insert into insurance_rules (id, rule_key, version, coverage_layer, nomenclature, act_code, act_category, rule_type, fixed_coverage_amount, effective_from, source_id, verification_status, verified_by, verified_at)
values ('70000000-0000-4000-8000-000000000008', 'TEST-SPEC-ACT', 1, 'BASE', 'TESTNOM', 'T-SPEC', 'TEST_X4', 'FIXED_COVERAGE', 80, '2020-01-01', :src, 'VERIFIED', :rev, now());
-- a verified tiers-payant agreement for T-TPA only
insert into insurance_tiers_payant_agreements (clinic_id, organization_id, nomenclature, act_code, agreement_reference, effective_from, source_id, verification_status, verified_by, verified_at)
values (:cA, :'orga', 'TESTNOM', 'T-TPA', 'CONV-TEST-1', '2020-01-01', :src, 'VERIFIED', :rev, now());
-- a clinic-specific contract rule for clinic A (complementary, Mutuelle Test)
insert into insurance_rules (rule_key, version, clinic_id, organization_id, coverage_layer, act_category, rule_type, basis, coverage_rate, effective_from, source_id, verification_status, verified_by, verified_at)
values ('TEST-CLINIC-A', 1, :cA, :'orgb', 'COMPLEMENTARY', 'TEST_X9', 'COVERAGE_RATE', 'BILLED', 0.2, '2020-01-01', :src, 'VERIFIED', :rev, now());
set role authenticated;
select t.as_(:secA);

-- ================================================================ 1. no rule -> MANUAL_REQUIRED
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-NORULE","label":"x","billed_amount":300}') as r \gset r1_
select t.check((:'r1_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r1_r'::jsonb)->>'match_outcome' = 'NO_MATCH'
  and (:'r1_r'::jsonb)->>'reason_code' = 'NO_VERIFIED_RULE' and (:'r1_r'::jsonb)->'organism_amount' = 'null'
  and (:'r1_r'::jsonb)->'patient_amount' = 'null' and (:'r1_r'::jsonb)->'tnr_amount' = 'null',
  '1. no rule: MANUAL_REQUIRED / NO_MATCH, no 0 %, no 100 %, no TNR = billed', :'r1_r');
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-UNKNOWN","label":"x","billed_amount":300}') as r \gset r1b_
select t.check((:'r1b_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r1b_r'::jsonb)->>'reason_code' = 'ACT_NOT_VERIFIED',
  '1. act absent from the verified catalog: MANUAL_REQUIRED', :'r1b_r');
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-NOTNR","label":"x","billed_amount":300}') as r \gset r1c_
select t.check((:'r1c_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r1c_r'::jsonb)->>'reason_code' = 'NO_VERIFIED_TNR'
  and (:'r1c_r'::jsonb)->'organism_amount' = 'null',
  '1. rule on the TNR but no verified TNR: MANUAL_REQUIRED (TNR never assumed = billed)', :'r1c_r');

-- ================================================================ 2. unverified rule
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-UNV","label":"x","billed_amount":300}') as r \gset r2_
select t.check((:'r2_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r2_r'::jsonb)->>'match_outcome' = 'UNVERIFIED_MATCH'
  and (:'r2_r'::jsonb)->'organism_amount' = 'null', '2. unverified rule: ignored, MANUAL_REQUIRED / UNVERIFIED_MATCH', :'r2_r');

-- ================================================================ 3. expired rule
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-EXP","label":"x","billed_amount":300}') as r \gset r3_
select t.check((:'r3_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r3_r'::jsonb)->>'match_outcome' = 'EXPIRED_RULE'
  and (:'r3_r'::jsonb)->'organism_amount' = 'null', '3. expired rule: MANUAL_REQUIRED / EXPIRED_RULE', :'r3_r');

-- ================================================================ 4. conflict
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-CONF","label":"x","billed_amount":300}') as r \gset r4_
select t.check((:'r4_r'::jsonb)->>'status' = 'CONFLICT' and (:'r4_r'::jsonb)->>'match_outcome' = 'MULTIPLE_EQUAL_VALID_MATCHES'
  and jsonb_array_length((:'r4_r'::jsonb)->'conflicting_ids') = 2 and (:'r4_r'::jsonb)->'organism_amount' = 'null',
  '4. two equally specific verified rules: CONFLICT, both ids reported, no amount', :'r4_r');
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-SPEC","label":"x","billed_amount":300}') as r \gset r4b_
select t.check((:'r4b_r'::jsonb)->>'status' = 'CALCULATED' and (:'r4b_r'::jsonb)->>'rule_id' = '70000000-0000-4000-8000-000000000008'
  and ((:'r4b_r'::jsonb)->>'organism_amount')::numeric = 80,
  '4. a strictly more specific rule (act) is preferred over the category rule', :'r4b_r');
reset role;
select t.fails($$insert into insurance_rules (rule_key, version, coverage_layer, nomenclature, act_code, rule_type, basis, coverage_rate, effective_from, source_id, verification_status, verified_by, verified_at)
  values ('TEST-CONS-DUP', 1, 'BASE', 'TESTNOM', 'T-CONS', 'COVERAGE_RATE', 'TNR', 0.9, '2026-06-01', '50000000-0000-4000-8000-000000000001', 'VERIFIED', 'a0000000-0000-4000-8000-000000000001', now())$$,
  'no_verified_overlap', '14. overlapping verified rule with the same scope refused');
set role authenticated;

-- ================================================================ 5 / 7. one verified rule, current date
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"Consultation test","billed_amount":300}') as r \gset r5_
select t.check((:'r5_r'::jsonb)->>'status' = 'CALCULATED' and (:'r5_r'::jsonb)->>'match_outcome' = 'ONE_VERIFIED_MATCH'
  and ((:'r5_r'::jsonb)->>'tnr_amount')::numeric = 200 and ((:'r5_r'::jsonb)->>'reimbursement_basis')::numeric = 200
  and ((:'r5_r'::jsonb)->>'organism_amount')::numeric = 120 and ((:'r5_r'::jsonb)->>'patient_amount')::numeric = 180
  and (:'r5_r'::jsonb)->>'rule_id' = '70000000-0000-4000-8000-000000000002'
  and (:'r5_r'::jsonb)->'sources'->0->>'source_code' = 'SRC-TEST-001'
  and (select array_agg(e->>'key') from jsonb_array_elements((:'r5_r'::jsonb)->'explanation') e) @> array['billed','act','rule','tnr','basis','organism','patient'],
  '5. one verified rule: billed 300, TNR 200, basis 200, organism 120, patient 180, rule + source + explanation', :'r5_r');
select t.check((:'r5_r'::jsonb)->>'rule_id' <> '70000000-0000-4000-8000-000000000001',
  '7. care on 2026-09-27 does not use the version that ended on 2026-01-01');
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-FUT","label":"x","billed_amount":300}') as r \gset r7_
select t.check((:'r7_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r7_r'::jsonb)->>'match_outcome' = 'NO_MATCH',
  '7. a rule effective only in the future is not used', :'r7_r');
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-KEY","label":"x","billed_amount":300}') as r \gset r5k_
select t.check((:'r5k_r'::jsonb)->>'status' = 'CALCULATED' and ((:'r5k_r'::jsonb)->>'tnr_amount')::numeric = 150
  and ((:'r5k_r'::jsonb)->>'organism_amount')::numeric = 75 and (:'r5k_r'::jsonb)->>'prior_authorization' = 'REQUIRED'
  and (:'r5k_r'::jsonb)->'tiers_payant'->>'status' = 'ELIGIBLE',
  '5. key letter x coefficient: 10 x 15 = TNR 150, organism 75; prior authorization REQUIRED; tiers payant ELIGIBLE', :'r5k_r');

-- ================================================================ 6. historical date
select t.prev(:i2, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"x","billed_amount":300}') as r \gset r6_
select t.check((:'r6_r'::jsonb)->>'rule_id' = '70000000-0000-4000-8000-000000000001' and ((:'r6_r'::jsonb)->>'organism_amount')::numeric = 100
  and (:'r6_r'::jsonb)->>'date_of_care' = '2025-06-15',
  '6. care on 2025-06-15 (visit day) uses the version in force then: organism 100', :'r6_r');

-- ================================================================ 10. tiers-payant conditional eligibility
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-TP","label":"x","billed_amount":300}') as r \gset r10_
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-TPA","label":"x","billed_amount":300}') as r \gset r10b_
select t.check((:'r10_r'::jsonb)->'tiers_payant'->>'status' = 'AGREEMENT_NOT_FOUND'
  and (:'r10b_r'::jsonb)->'tiers_payant'->>'status' = 'ELIGIBLE' and (:'r10b_r'::jsonb)->'tiers_payant'->>'agreement_id' is not null
  and (:'r1_r'::jsonb)->'tiers_payant'->>'status' = 'UNVERIFIED',
  '10. tiers payant: agreement required and missing / verified agreement found / no rule = UNVERIFIED', :'r10_r' || ' | ' || :'r10b_r');
select t.check((:'r5_r'::jsonb)->>'prior_authorization' = 'NOT_REQUIRED' and (:'r1_r'::jsonb)->>'prior_authorization' = 'UNKNOWN',
  '11. prior authorization: NOT_REQUIRED from a rule, UNKNOWN without one');

-- ================================================================ preview writes nothing
select t.ncalc() as n \gset before_
select calculate_insurance_lines(:i1, :'cova', '[{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"x","billed_amount":300}]') \gset x_
select t.check(t.ncalc() = :before_n, 'preview writes nothing');
select t.fails($$select calculate_insurance_lines('e6000000-0000-4000-8000-000000000001', '$$ || :'cova' || $$', '[{"label":"x","billed_amount":200},{"label":"y","billed_amount":200}]')$$,
  'exceeds the invoice amount', 'lines above the invoice amount refused');

-- ================================================================ 9. manual override / creating claims with lines
select t.fails($$select create_insurance_claim_with_lines('e6000000-0000-4000-8000-000000000003', '$$ || :'cova' || $$', '[{"label":"Consultation","billed_amount":300}]')$$,
  'automatic calculation unavailable.*manually with a reason', '9. MANUAL_REQUIRED line without a manual amount refused');
select t.fails($$select create_insurance_claim_with_lines('e6000000-0000-4000-8000-000000000003', '$$ || :'cova' || $$', '[{"label":"Consultation","billed_amount":300,"manual_organism_amount":150}]')$$,
  'needs a reason', '9. manual amount without a reason refused');
select t.fails($$select create_insurance_claim_with_lines('e6000000-0000-4000-8000-000000000003', '$$ || :'cova' || $$', '[{"label":"Consultation","billed_amount":300,"manual_organism_amount":350,"manual_reason":"x"}]')$$,
  'between 0 and the billed amount', '9. manual amount above the billed amount refused');
select t.rules_md5() as m \gset rules_before_
select id as c9 from create_insurance_claim_with_lines(:i3, :'cova', '[{"label":"Consultation","billed_amount":300,"manual_organism_amount":150,"manual_reason":"Montant communiqué par l''organisme"}]') \gset
select t.lines(:'c9') as l, t.snap(:'c9') as s \gset c9_
select t.check(jsonb_array_length(:'c9_l'::jsonb) = 1 and (:'c9_l'::jsonb)->0->>'amount_source' = 'MANUAL'
  and (:'c9_l'::jsonb)->0->>'calculation_status' = 'MANUAL_REQUIRED' and ((:'c9_l'::jsonb)->0->>'organism_amount')::numeric = 150
  and ((:'c9_l'::jsonb)->0->>'patient_amount')::numeric = 150 and (:'c9_l'::jsonb)->0->>'manual_reason' = 'Montant communiqué par l''organisme'
  and (:'c9_l'::jsonb)->0->>'entered_by' = 'a0000000-0000-4000-8000-000000000002' and (:'c9_l'::jsonb)->0->>'rule_id' is null,
  '9. manual line: amount, reason, user, status MANUAL_REQUIRED kept', :'c9_l');
select t.check((:'c9_s'::jsonb)->0->>'status' = 'MANUAL_REQUIRED' and (:'c9_s'::jsonb)->0->'organism_amount' = 'null'
  and (:'c9_s'::jsonb)->0->>'reason' like 'Aucune règle d''assurance vérifiée%'
  and ((:'c9_s'::jsonb)->0->'manual_override'->>'amount')::numeric = 150
  and (:'c9_s'::jsonb)->0->'manual_override'->>'entered_by' = 'a0000000-0000-4000-8000-000000000002'
  and (:'c9_s'::jsonb)->0->'manual_override'->>'entered_at' is not null
  and (:'c9_s'::jsonb)->0->'manual_override'->>'label' = 'Montant saisi manuellement',
  '9. snapshot keeps the evidence that no verified rule existed, plus the manual entry', :'c9_s');
select t.check(t.claimed(:'c9') = 150 and (t.rec(:i3)->>'org_share')::numeric = 150 and (t.rec(:i3)->>'patient_due')::numeric = 150
  and t.rec(:i3)->>'status' = 'RECONCILED', '9. claim total = sum of lines, invoice reconciled', t.rec(:i3)::text);
-- override of a CALCULATED line
select id as c9b from create_insurance_claim_with_lines(:i4, :'cova', '[{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"Consultation test","billed_amount":300,"manual_organism_amount":100,"manual_reason":"Accord partiel"}]') \gset
select t.lines(:'c9b') as l, t.snap(:'c9b') as s \gset c9b_
select t.check((:'c9b_s'::jsonb)->0->>'status' = 'CALCULATED' and ((:'c9b_s'::jsonb)->0->>'organism_amount')::numeric = 120
  and ((:'c9b_s'::jsonb)->0->'manual_override'->>'amount')::numeric = 100
  and (:'c9b_l'::jsonb)->0->>'amount_source' = 'MANUAL' and ((:'c9b_l'::jsonb)->0->>'organism_amount')::numeric = 100
  and (:'c9b_l'::jsonb)->0->>'calculation_status' = 'CALCULATED',
  '9. override of a calculated line: automatic 120 kept in the snapshot, manual 100 on the line', :'c9b_l');
select t.check(t.rules_md5() = :'rules_before_m', '9. manual entries never touch rule data');

-- ================================================================ calculated claim
select id as c5 from create_insurance_claim_with_lines(:i5, :'cova', '[{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"Consultation test","billed_amount":300}]') \gset
select t.lines(:'c5') as l, t.snap(:'c5') as s \gset c5_
select t.check((:'c5_l'::jsonb)->0->>'amount_source' = 'CALCULATED' and ((:'c5_l'::jsonb)->0->>'organism_amount')::numeric = 120
  and ((:'c5_l'::jsonb)->0->>'tnr_amount')::numeric = 200 and (:'c5_l'::jsonb)->0->>'rule_id' = '70000000-0000-4000-8000-000000000002'
  and (:'c5_s'::jsonb)->0->>'rule_key' = 'TEST-CONS' and ((:'c5_s'::jsonb)->0->>'rule_version')::int = 2
  and (:'c5_s'::jsonb)->0->>'engine_version' = '1' and (:'c5_s'::jsonb)->0->>'date_of_care' = '2026-09-27'
  and (:'c5_s'::jsonb)->0->'source_ids' ? '50000000-0000-4000-8000-000000000001'
  and (:'c5_s'::jsonb)->0->'result'->'rule'->>'coverage_rate' is not null and (:'c5_s'::jsonb)->0->'result'->'tariff'->>'flat_amount' is not null
  and (:'c5_s'::jsonb)->0->'coverage_context'->>'membership_number' = 'T-123'
  and t.claimed(:'c5') = 120 and t.rec(:i5)->>'status' = 'RECONCILED',
  '5. calculated claim: line 120 from rule TEST-CONS v2, snapshot copies rule, tariff, source, coverage, date of care', :'c5_s');

-- ================================================================ 6. multiple claim lines
select id as c6 from create_insurance_claim_with_lines(:i6, :'cova', '[
  {"nomenclature":"TESTNOM","act_code":"T-CONS","label":"Consultation test","billed_amount":300},
  {"nomenclature":"TESTNOM","act_code":"T-KEY","label":"Acte technique test","billed_amount":100},
  {"label":"Fournitures","billed_amount":50,"manual_organism_amount":10,"manual_reason":"Forfait convenu"}]') \gset
select t.lines(:'c6') as l \gset c6_
select t.check(jsonb_array_length(:'c6_l'::jsonb) = 3 and t.claimed(:'c6') = 120 + 50 + 10
  and ((:'c6_l'::jsonb)->1->>'reimbursement_basis')::numeric = 100 and ((:'c6_l'::jsonb)->1->>'organism_amount')::numeric = 50
  and (t.rec(:i6)->>'org_share')::numeric = 180 and (t.rec(:i6)->>'patient_due')::numeric = 320 and t.rec(:i6)->>'status' = 'RECONCILED',
  '6. three lines (calculated, calculated with basis = billed < TNR, manual): claim 180 = sum of lines, invoice reconciled', :'c6_l');

-- ================================================================ 8. multiple organizations + complementary coverage
select t.prev(:i7, :'covb', '{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"x","billed_amount":300}') as r \gset r8_
select t.check((:'r8_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r8_r'::jsonb)->>'reason_code' = 'BASE_AMOUNT_REQUIRED'
  and (:'r8_r'::jsonb)->>'layer' = 'COMPLEMENTARY', '8. complementary layer without the base amount: MANUAL_REQUIRED', :'r8_r');
select t.prev(:i7, :'covb', '{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"x","billed_amount":300,"base_organism_amount":120}') as r \gset r8b_
select t.check((:'r8b_r'::jsonb)->>'status' = 'CALCULATED' and ((:'r8b_r'::jsonb)->>'organism_amount')::numeric = 80
  and (:'r8b_r'::jsonb)->>'rule_id' = '70000000-0000-4000-8000-000000000013',
  '8. complementary layer with its own verified rule and the base amount: 80', :'r8b_r');
select t.prev(:i7, :'covb', '{"nomenclature":"TESTNOM","act_code":"T-NORULE","label":"x","billed_amount":300,"base_organism_amount":120}') as r \gset r8c_
select t.check((:'r8c_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r8c_r'::jsonb)->'organism_amount' = 'null',
  '8. no complementary rule: MANUAL_REQUIRED, complementary reimbursement never assumed', :'r8c_r');
select id as c8a from create_insurance_claim_with_lines(:i7, :'cova', '[{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"Consultation test","billed_amount":300}]') \gset
select id as c8b from create_insurance_claim_with_lines(:i7, :'covb', '[{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"Consultation test","billed_amount":300,"base_organism_amount":120}]') \gset
select t.check(t.claimed(:'c8a') = 120 and t.claimed(:'c8b') = 80 and (t.rec(:i7)->>'org_share')::numeric = 200
  and (t.rec(:i7)->>'patient_due')::numeric = 100 and t.rec(:i7)->>'status' = 'RECONCILED',
  '8. base 120 + complementary 80 on one invoice: organism share 200, patient 100, reconciled', t.rec(:i7)::text);
-- an AMO rejection does not move anything to the complementary layer
select update_claim_status(:'c8a', 'SUBMITTED') \gset x_
select reject_insurance_claim(:'c8a', 'Rejet test', 120) \gset x_
select t.prev(:i8, :'covb', '{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"x","billed_amount":300}') as r \gset r8d_
select t.check(t.claimed(:'c8b') = 80 and (:'r8d_r'::jsonb)->>'reason_code' = 'BASE_AMOUNT_REQUIRED' and t.rec(:i7)->>'status' = 'RECONCILED'
  and (t.rec(:i7)->>'unresolved')::numeric = 120,
  '8. AMO rejection: complementary claim unchanged, nothing transferred automatically', t.rec(:i7)::text);
-- clinic contract rule (clinic A only)
select t.prev(:i8, :'covb', '{"nomenclature":"TESTNOM","act_code":"T-NOTNR","label":"x","billed_amount":300,"base_organism_amount":0}') as r \gset r8e_
select t.check((:'r8e_r'::jsonb)->>'status' = 'CALCULATED' and ((:'r8e_r'::jsonb)->>'organism_amount')::numeric = 60,
  '8. clinic-specific contract rule applies in its clinic', :'r8e_r');

-- ================================================================ 10/11 (financial). existing manual claim + ledgers
select id as c10 from create_insurance_claim(:i9, :'cova', 180) \gset
select t.check(jsonb_array_length(t.lines(:'c10')) = 0 and t.claimed(:'c10') = 180 and t.rec(:i9)->>'status' = 'RECONCILED'
  and (t.rec(:i9)->>'patient_due')::numeric = 120, '10. existing manual claim (no lines) still works', t.rec(:i9)::text);
select update_claim_status(:'c5', 'SUBMITTED') \gset x_
select record_insurance_settlement(:'c5', 70, 'BANK_TRANSFER', now(), 'VIR-T', null, gen_random_uuid()) \gset x_
select reject_insurance_claim(:'c5', 'Rejet partiel test', 50) \gset x_
select t.check((t.rec(:i5)->>'org_received')::numeric = 70 and (t.rec(:i5)->>'unresolved')::numeric = 50 and t.rec(:i5)->>'status' = 'RECONCILED',
  '11. settlement + rejection on a claim with lines reconcile as before', t.rec(:i5)::text);
select refile_insurance_claim((select id from insurance_claim_rejections where claim_id = :'c5'), null, null) \gset x_
select t.check(t.rec(:i5)->>'status' = 'RECONCILED', '11. refiling a rejection of a claim with lines reconciles', t.rec(:i5)::text);
select t.check((select count(*) = 0 from invoice_financials where reconciliation_status <> 'RECONCILED'), '11. ALL invoices RECONCILED');

-- ================================================================ 16 / 15. history unchanged
select t.snap(:'c5') as s, t.lines(:'c5') as l \gset hist_
reset role;
update insurance_rules set effective_until = '2026-09-01' where id = '70000000-0000-4000-8000-000000000002';
insert into insurance_rules (rule_key, version, coverage_layer, nomenclature, act_code, rule_type, basis, coverage_rate, effective_from, source_id, verification_status, verified_by, verified_at)
values ('TEST-CONS', 3, 'BASE', 'TESTNOM', 'T-CONS', 'COVERAGE_RATE', 'TNR', 0.9, '2026-09-01', :src, 'VERIFIED', :rev, now());
update patient_coverages set membership_number = 'T-CHANGED' where id = :'cova';
set role authenticated;
select t.check(t.snap(:'c5') = :'hist_s'::jsonb and t.lines(:'c5') = :'hist_l'::jsonb,
  '16/15. new rule version + changed patient coverage: historical claim and snapshot unchanged');
select t.prev(:i1, :'cova', '{"nomenclature":"TESTNOM","act_code":"T-CONS","label":"x","billed_amount":300}') as r \gset r16_
select t.check(((:'r16_r'::jsonb)->>'organism_amount')::numeric = 180 and (:'r16_r'::jsonb)->'inputs'->'coverage'->>'membership_number' = 'T-CHANGED',
  '16. a new calculation uses the new version and the current coverage', :'r16_r');

-- ================================================================ 17. immutability
reset role;
select t.fails($$update insurance_calculations set organism_amount = 1 where claim_id = '$$ || :'c5' || $$'$$, 'immutable', '17. snapshot cannot be updated (even by the owner)');
select t.fails($$delete from insurance_calculations where claim_id = '$$ || :'c5' || $$'$$, 'immutable', '17. snapshot cannot be deleted');
select t.fails($$update insurance_claim_lines set organism_amount = 1 where claim_id = '$$ || :'c5' || $$'$$, 'immutable', '17. claim line cannot be updated');
select t.fails($$update insurance_claims set amount_claimed = 1 where id = '$$ || :'c5' || $$'$$, 'immutable', '17. claim total not editable once lines exist');
select t.fails($$insert into insurance_claim_lines (clinic_id, claim_id, patient_id, organization_id, line_no, label, date_of_care, billed_amount, organism_amount, patient_amount, calculation_status, amount_source, manual_reason, entered_by, calculation_snapshot_id)
  select clinic_id, claim_id, patient_id, organization_id, 9, 'ajout', date_of_care, 10, 0, 10, 'MANUAL_REQUIRED', 'MANUAL', 'x', entered_by, calculation_snapshot_id from insurance_claim_lines where claim_id = '$$ || :'c9' || $$'$$,
  'with their claim only', '17. no line can be added to an existing claim');
select t.fails($$update insurance_rules set coverage_rate = 0.99 where id = '70000000-0000-4000-8000-000000000002'$$, 'immutable', 'reference: a verified rule cannot be rewritten');
select t.fails($$delete from insurance_rules where id = '70000000-0000-4000-8000-000000000002'$$, 'never deleted', 'reference: a verified rule cannot be deleted');
select t.fails($$insert into insurance_rules (rule_key, coverage_layer, act_category, rule_type, basis, coverage_rate, effective_from, source_id, verification_status, verified_by, verified_at)
  values ('TEST-NOSRC', 'BASE', 'TEST_Z', 'COVERAGE_RATE', 'BILLED', 0.5, '2020-01-01', '50000000-0000-4000-8000-000000000002', 'VERIFIED', 'a0000000-0000-4000-8000-000000000001', now())$$,
  'archived source', 'reference: VERIFIED needs an archived source (checksum + retrieval date)');
select t.fails($$insert into insurance_rules (rule_key, coverage_layer, act_category, rule_type, basis, coverage_rate, effective_from, source_id, verification_status)
  values ('TEST-NOREV', 'BASE', 'TEST_Z', 'COVERAGE_RATE', 'BILLED', 0.5, '2020-01-01', '50000000-0000-4000-8000-000000000001', 'VERIFIED')$$,
  'who verified', 'reference: VERIFIED needs a reviewer');
select t.fails($$insert into insurance_rules (rule_key, coverage_layer, act_category, rule_type, basis, coverage_rate, conditions, effective_from, source_id, verification_status, verified_by, verified_at)
  values ('TEST-COND', 'BASE', 'TEST_Z', 'COVERAGE_RATE', 'BILLED', 0.5, '{"ald":true}', '2020-01-01', '50000000-0000-4000-8000-000000000001', 'VERIFIED', 'a0000000-0000-4000-8000-000000000001', now())$$,
  'conditions_supported', 'reference: a conditional rule cannot be VERIFIED by engine v1');
select t.fails($$update insurance_rule_sources set checksum = repeat('0', 64) where source_code = 'SRC-TEST-001'$$, 'backs verified data', 'reference: a source backing verified data is frozen');
select t.fails($$insert into insurance_tariffs (nomenclature, act_code, tariff_type, flat_amount, key_letter, effective_from) values ('TESTNOM', 'T-Z', 'FLAT', 10, 'X', '2020-01-01')$$,
  'flat_check', 'reference: a FLAT tariff cannot carry key-letter fields');

-- ================================================================ 12. clinic isolation
set role authenticated;
select t.as_(:secB);
select t.fails($$select calculate_insurance_lines('e6000000-0000-4000-8000-000000000001', '$$ || :'cova' || $$', '[{"label":"x","billed_amount":10}]')$$,
  'cross-clinic|not authorized', '12. another clinic cannot run the engine on this invoice');
select t.fails($$select create_insurance_claim_with_lines('e6000000-0000-4000-8000-000000000010', '$$ || :'cova' || $$', '[{"label":"x","billed_amount":10,"manual_organism_amount":5,"manual_reason":"x"}]')$$,
  'cross-clinic|not authorized', '12. another clinic cannot create a claim with lines here');
select t.check((select count(*) from insurance_claim_lines) = 0 and (select count(*) from insurance_calculations) = 0,
  '12. another clinic sees none of these lines or snapshots');
select t.check((select count(*) from insurance_rules where clinic_id is not null) = 0 and (select count(*) from insurance_rules) > 0,
  '12. clinic A contract rule invisible to clinic B; national rules visible');
select t.check((select count(*) from insurance_tiers_payant_agreements) = 0, '12. clinic A agreements invisible to clinic B');
select t.as_(:secA);
select t.check((select count(*) from insurance_claim_lines) > 0 and (select count(*) from insurance_calculations) > 0, '12. own clinic reads its lines and snapshots');
select t.fails($$insert into insurance_rules (rule_key, coverage_layer, act_category, rule_type, effective_from) values ('X', 'BASE', 'X', 'NOT_COVERED', '2020-01-01')$$,
  'permission denied|row-level', '12. clinics cannot write reference rules');

-- ================================================================ 13. anonymous
reset role;
set role anon;
select t.fails($$select count(*) from insurance_claim_lines$$, 'permission denied', '13. anon cannot read claim lines');
select t.fails($$select count(*) from insurance_calculations$$, 'permission denied', '13. anon cannot read snapshots');
select t.fails($$select count(*) from insurance_rules$$, 'permission denied', '13. anon cannot read rules');
select t.fails($$select calculate_insurance_lines('e6000000-0000-4000-8000-000000000001', null, '[]')$$, 'permission denied', '13. anon cannot run the engine');
select t.fails($$select create_insurance_claim_with_lines('e6000000-0000-4000-8000-000000000001', null, '[]')$$, 'permission denied', '13. anon cannot create claims with lines');
select t.fails($$select mm_calculate_insurance_line(null, null, null, '{}')$$, 'permission denied', '13. internal engine function not callable');
reset role;
set role authenticated;
select t.fails($$select mm_calculate_insurance_line(null, null, null, '{}')$$, 'permission denied', '13. internal engine function not callable by users either');
reset role;

\set QUIET 0
select n, case when ok then 'PASS' else 'FAIL' end as result, label, case when not ok then detail end as detail from t.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
