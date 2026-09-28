-- Stage 4C matrix: insurance context + act capture. Throwaway local database only.
-- TEST-ONLY fixtures: TESTNOM / T-* acts, TEST_* codes, SRC-TEST-* source, made-up rate. None of it
-- exists in any migration.
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
create function t.prev(p_inv uuid, p_cov uuid, p_line jsonb) returns jsonb language sql as
  $$ select public.calculate_insurance_lines(p_inv, p_cov, jsonb_build_array(p_line))->'lines'->0 $$;
create function t.rec(p uuid) returns jsonb language sql security definer as $$
  select jsonb_build_object('total', invoice_total, 'patient_due', patient_due, 'org_share', organism_share,
    'org_due', organism_due, 'status', reconciliation_status)
  from public.invoice_financials where invoice_id = p $$;
create function t.lines(p_claim uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(l) order by line_no), '[]') from public.insurance_claim_lines l where claim_id = p_claim $$;
create function t.snap(p_claim uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by line_no), '[]') from public.insurance_calculations c where claim_id = p_claim $$;
create function t.ctx(p_claim uuid) returns jsonb language sql security definer as $$
  select to_jsonb(c) from public.insurance_claim_contexts c where claim_id = p_claim $$;
create function t.claim(p uuid) returns jsonb language sql security definer as $$ select to_jsonb(c) from insurance_claims c where id = p $$;
create function t.cov(p uuid) returns jsonb language sql security definer as $$ select to_jsonb(c) from patient_coverages c where id = p $$;
create function t.audit(p_action text) returns bigint language sql security definer as $$ select count(*) from audit_logs where action = p_action $$;
grant execute on all functions in schema t to authenticated, anon;

\set cA '\'aaaaaaaa-0000-4000-8000-000000000000\''
\set docA '\'a0000000-0000-4000-8000-000000000001\''
\set secA '\'a0000000-0000-4000-8000-000000000002\''
\set secB '\'b0000000-0000-4000-8000-000000000002\''
\set pA1 '\'a1000000-0000-4000-8000-000000000001\''
\set pA2 '\'a1000000-0000-4000-8000-000000000002\''

select pg_temp.billing_visit(('d7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                             ('e7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                             :cA, :pA1, :docA, 600, n)
from generate_series(1, 9) n;
select pg_temp.billing_visit('d7000000-0000-4000-8000-000000000020', 'e7000000-0000-4000-8000-000000000020', :cA, :pA2, :docA, 300, 20);
update visits set queue_date = '2026-09-27' where id::text like 'd7000000%';
\set i20 '\'e7000000-0000-4000-8000-000000000020\''
\set i1 '\'e7000000-0000-4000-8000-000000000001\''
\set i2 '\'e7000000-0000-4000-8000-000000000002\''
\set i3 '\'e7000000-0000-4000-8000-000000000003\''
\set i4 '\'e7000000-0000-4000-8000-000000000004\''
\set i5 '\'e7000000-0000-4000-8000-000000000005\''
\set i6 '\'e7000000-0000-4000-8000-000000000006\''
\set i7 '\'e7000000-0000-4000-8000-000000000007\''

set role authenticated;
select t.as_(:secA);
select id as orga from upsert_insurance_organization(null, 'Organisme Test Base', 'AMO_MANAGER') \gset
select id as orgb from upsert_insurance_organization(null, 'Mutuelle Test', 'MUTUELLE') \gset

-- ================================================================ 1/2. patient scheme
select id as cova from upsert_patient_coverage(null, :pA1, 'AMO', :'orga', '123456789', 'ASSURE', null, null, true, null, null) \gset
select t.check(t.cov(:'cova')->>'scheme_code' is null, '2. an AMO coverage can be saved without a scheme (not inferred from number / organization / beneficiary)');
select t.prev(:i1, :'cova', '{"label":"x","billed_amount":100,"nomenclature":"TESTNOM","act_code":"T-CONS"}') as r \gset r2_
select t.check((:'r2_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r2_r'::jsonb)->'missing_context' ? 'SCHEME'
  and (:'r2_r'::jsonb)->'organism_amount' = 'null',
  '2. scheme missing is listed in missing_context even when the act is unknown', :'r2_r');
select t.fails($$select upsert_patient_coverage('$$ || :'cova' || $$', 'a1000000-0000-4000-8000-000000000001', 'AMO', '$$ || :'orga' || $$', '123456789', 'ASSURE', null, null, true, null, 'bad code!')$$,
  'invalid scheme code', '1. an invalid scheme code is refused');
select id as cova from upsert_patient_coverage(:'cova', :pA1, 'AMO', :'orga', '123456789', 'ASSURE', null, null, true, null, ' test_scheme ') \gset
select t.check(t.cov(:'cova')->>'scheme_code' = 'TEST_SCHEME', '1. scheme editable, normalized to an upper-case code');
select id as covb from upsert_patient_coverage(null, :pA1, 'COMPLEMENTARY', :'orgb', 'M-1', 'ASSURE', null, null, true, null, 'TEST_SCHEME') \gset
select t.check(t.cov(:'covb')->>'scheme_code' is null, '1. a scheme is only kept on an AMO coverage');

-- ================================================================ 13. empty production catalogue
select t.check((select count(*) from search_insurance_acts(:i1, null)) = 0, '13. act search returns nothing: production catalogue empty');
select t.check((select count(*) from insurance_act_catalog) + (select count(*) from insurance_tariffs) + (select count(*) from insurance_rules)
  + (select count(*) from insurance_rule_sources) + (select count(*) from insurance_coverage_schemes) = 0, '13. reference tables empty after the migrations');

-- ================================================================ 4. provider context missing
select get_insurance_context(:i1, :'cova') as c \gset c4_
select t.check((:'c4_c'::jsonb)->'missing_context' ?& array['PROVIDER_SECTOR', 'PROVIDER_CATEGORY']
  and (:'c4_c'::jsonb)->'provider'->>'provider_id' = 'a0000000-0000-4000-8000-000000000001'
  and (:'c4_c'::jsonb)->>'date_of_care' = '2026-09-27' and (:'c4_c'::jsonb)->'patient'->>'scheme_code' = 'TEST_SCHEME',
  '4/12. context RPC: provider sector and category reported missing; practitioner = visit doctor; server date of care', :'c4_c');
select t.fails($$select set_insurance_provider_context('TEST_SECTOR', 'TEST_CATEGORY')$$, 'not authorized', '2. a secretary cannot set the provider context');
reset role;
select t.fails($$update cabinets set provider_sector_code = 'X' where id = 'aaaaaaaa-0000-4000-8000-000000000000'$$, 'set_insurance_provider_context only',
  '2. provider sector cannot be written directly');
select t.fails($$update profiles set provider_category_code = 'X' where id = 'a0000000-0000-4000-8000-000000000001'$$, 'set_insurance_provider_context only',
  '2. practitioner category cannot be written directly');

-- ================================================================ TEST-ONLY reference fixtures
insert into insurance_rule_sources (id, source_code, issuing_body, title, document_type, version, checksum, retrieved_at, notes)
values ('50000000-0000-4000-8000-000000000001', 'SRC-TEST-001', 'TEST', 'Fixture de test (fictive)', 'TEST_FIXTURE', 'v1',
        encode(sha256('stage4c test fixture'), 'hex'), now(), 'test only');
insert into insurance_coverage_schemes (code, label, coverage_layer, notes) values ('TEST_SCHEME', 'Régime de test (fictif)', 'BASE', 'test only');
\set src '\'50000000-0000-4000-8000-000000000001\''
\set rev '\'a0000000-0000-4000-8000-000000000001\''
insert into insurance_act_catalog (id, nomenclature, code, label, category, effective_from, source_id, verification_status, verified_by, verified_at)
values ('60000000-0000-4000-8000-000000000001', 'TESTNOM', 'T-CONS', 'Acte test consultation', 'TEST_CONSULTATION', '2020-01-01', :src, 'VERIFIED', :rev, now()),
       ('60000000-0000-4000-8000-000000000002', 'TESTNOM', 'T-NORULE', 'Acte test sans règle', 'TEST_OTHER', '2020-01-01', :src, 'VERIFIED', :rev, now());
insert into insurance_act_catalog (nomenclature, code, label, category, effective_from, verification_status)
values ('TESTNOM', 'T-DRAFT', 'Acte test non vérifié', 'TEST_OTHER', '2020-01-01', 'DRAFT');
insert into insurance_tariffs (nomenclature, act_code, tariff_type, flat_amount, effective_from, source_id, verification_status, verified_by, verified_at)
values ('TESTNOM', 'T-CONS', 'FLAT', 200, '2020-01-01', :src, 'VERIFIED', :rev, now());
insert into insurance_rules (rule_key, version, coverage_layer, nomenclature, act_code, rule_type, basis, coverage_rate, effective_from, source_id, verification_status, verified_by, verified_at)
values ('TEST-CONS', 1, 'BASE', 'TESTNOM', 'T-CONS', 'COVERAGE_RATE', 'TNR', 0.6, '2020-01-01', :src, 'VERIFIED', :rev, now());
set role authenticated;
select t.as_(:secA);

select t.prev(:i1, :'cova', '{"label":"x","billed_amount":300,"nomenclature":"TESTNOM","act_code":"T-CONS"}') as r \gset r4b_
select t.check((:'r4b_r'::jsonb)->>'reason_code' = 'PROVIDER_SECTOR_MISSING' and (:'r4b_r'::jsonb)->>'reason' = 'Secteur du cabinet non renseigné pour l''assurance.'
  and (:'r4b_r'::jsonb)->'organism_amount' = 'null' and (:'r4b_r'::jsonb)->'missing_context' ?& array['PROVIDER_SECTOR', 'PROVIDER_CATEGORY']
  and (:'r4b_r'::jsonb)->'act'->>'code' = 'T-CONS',
  '4. provider context missing: MANUAL_REQUIRED even with a verified act, rule and TNR', :'r4b_r');

\set i6 '\'e7000000-0000-4000-8000-000000000006\''
select id as c4 from create_insurance_claim_with_lines(:i6, :'cova', '[{"act_id":"60000000-0000-4000-8000-000000000001","label":"Acte test consultation","billed_amount":300,"manual_organism_amount":100,"manual_reason":"Contexte incomplet"}]') \gset
select t.lines(:'c4') as l \gset c4l_
select t.check((:'c4l_l'::jsonb)->0->>'act_code' = 'T-CONS' and (:'c4l_l'::jsonb)->0->>'act_id' = '60000000-0000-4000-8000-000000000001'
  and (:'c4l_l'::jsonb)->0->>'calculation_status' = 'MANUAL_REQUIRED' and (:'c4l_l'::jsonb)->0->>'amount_source' = 'MANUAL'
  and t.ctx(:'c4')->'missing_context' ?& array['PROVIDER_SECTOR', 'PROVIDER_CATEGORY'],
  '4/5. selected act with provider context missing: act kept on the line, MANUAL_REQUIRED, missing context frozen with the claim', :'c4l_l');

-- ================================================================ 3. provider context present
select t.as_(:docA);
select set_insurance_provider_context('test_sector', null) \gset x_
select t.as_(:secA);
select t.prev(:i1, :'cova', '{"label":"x","billed_amount":300,"nomenclature":"TESTNOM","act_code":"T-CONS"}') as r \gset r3a_
select t.check((:'r3a_r'::jsonb)->>'reason_code' = 'PROVIDER_CATEGORY_MISSING' and (:'r3a_r'::jsonb)->>'reason' = 'Catégorie du praticien non renseignée pour l''assurance.',
  '4. practitioner category missing (specialty is never used to derive it)', :'r3a_r');
select t.as_(:docA);
select set_insurance_provider_context('TEST_SECTOR', 'TEST_CATEGORY') \gset x_
select t.check(t.audit('INSURANCE_PROVIDER_CONTEXT_SET') = 2, '3. provider context changes are audited');
select t.as_(:secA);
select t.prev(:i1, :'cova', '{"label":"x","billed_amount":300,"nomenclature":"TESTNOM","act_code":"T-CONS"}') as r \gset r3_
select t.check((:'r3_r'::jsonb)->>'status' = 'CALCULATED' and ((:'r3_r'::jsonb)->>'organism_amount')::numeric = 120
  and jsonb_array_length((:'r3_r'::jsonb)->'missing_context') = 0
  and (:'r3_r'::jsonb)->'inputs'->'context'->>'sector' = 'TEST_SECTOR' and (:'r3_r'::jsonb)->'inputs'->'context'->>'provider_category' = 'TEST_CATEGORY',
  '1/3. scheme + provider context present: the test rule calculates (120), context read server-side', :'r3_r');
-- scheme missing / not in the reference, with a verified act and complete provider context
select id as cova2 from upsert_patient_coverage(null, :pA2, 'AMO', :'orga', 'P2', 'ASSURE', null, null, true, null, null) \gset
select t.prev(:i20, :'cova2', '{"label":"x","billed_amount":300,"act_id":"60000000-0000-4000-8000-000000000001"}') as r \gset r2b_
select t.check((:'r2b_r'::jsonb)->>'status' = 'MANUAL_REQUIRED' and (:'r2b_r'::jsonb)->>'reason' = 'Régime AMO non renseigné.'
  and (:'r2b_r'::jsonb)->'missing_context' = '["SCHEME"]' and (:'r2b_r'::jsonb)->'act'->>'code' = 'T-CONS'
  and (:'r2b_r'::jsonb)->'organism_amount' = 'null',
  '2. scheme missing: MANUAL_REQUIRED "Régime AMO non renseigné." (act still identified)', :'r2b_r');
select id as cova2 from upsert_patient_coverage(:'cova2', :pA2, 'AMO', :'orga', 'P2', 'ASSURE', null, null, true, null, 'TEST_UNLISTED') \gset
select t.prev(:i20, :'cova2', '{"label":"x","billed_amount":300,"act_id":"60000000-0000-4000-8000-000000000001"}') as r \gset r1_
select t.check((:'r1_r'::jsonb)->>'reason_code' = 'SCHEME_NOT_IN_REFERENCE' and (:'r1_r'::jsonb)->'organism_amount' = 'null',
  '1. a scheme code absent from the verified reference: MANUAL_REQUIRED, reported as such', :'r1_r');
select get_insurance_context(:i1, :'cova') as c \gset c3_
select t.check(jsonb_array_length((:'c3_c'::jsonb)->'missing_context') = 0, '3. context RPC: nothing missing');

-- ================================================================ 13 (tiers payant). context reported, never deduced
select t.check((:'r3_r'::jsonb)->'tiers_payant'->>'status' = 'UNVERIFIED'
  and (:'r3_r'::jsonb)->'tiers_payant'->>'establishment_id' = 'aaaaaaaa-0000-4000-8000-000000000000'
  and (:'r3_r'::jsonb)->'tiers_payant'->>'provider_id' = 'a0000000-0000-4000-8000-000000000001'
  and (:'r3_r'::jsonb)->'tiers_payant'->>'verified_agreement_on_file' = 'false',
  'tiers payant: UNVERIFIED with establishment / practitioner / organization context (AMO alone is not eligibility)', :'r3_r');
reset role;
insert into insurance_tiers_payant_agreements (clinic_id, organization_id, agreement_reference, effective_from, source_id, verification_status, verified_by, verified_at)
values (:cA, :'orga', 'CONV-TEST', '2020-01-01', :src, 'VERIFIED', :rev, now());
set role authenticated;
select t.as_(:secA);
select t.prev(:i1, :'cova', '{"label":"x","billed_amount":300,"nomenclature":"TESTNOM","act_code":"T-CONS"}') as r \gset r13_
select t.check((:'r13_r'::jsonb)->'tiers_payant'->>'status' = 'UNVERIFIED' and (:'r13_r'::jsonb)->'tiers_payant'->>'verified_agreement_on_file' = 'true',
  'tiers payant: a verified agreement on file is reported but does not make the patient eligible without a rule', :'r13_r');

-- ================================================================ 5. act search + selected act
select t.check((select count(*) from search_insurance_acts(:i1, null)) = 2 and (select count(*) from search_insurance_acts(:i1, 'consult')) = 1
  and not exists (select 1 from search_insurance_acts(:i1, null) where code = 'T-DRAFT'),
  '5. act search: verified acts in force only (draft act hidden), text search on code / label');
select id as c5 from create_insurance_claim_with_lines(:i2, :'cova', '[{"act_id":"60000000-0000-4000-8000-000000000001","label":"Acte test consultation","quantity":1,"billed_amount":300}]') \gset
select t.lines(:'c5') as l \gset c5_
select t.check(jsonb_array_length(:'c5_l'::jsonb) = 1 and (:'c5_l'::jsonb)->0->>'act_id' = '60000000-0000-4000-8000-000000000001'
  and (:'c5_l'::jsonb)->0->>'act_code' = 'T-CONS' and (:'c5_l'::jsonb)->0->>'nomenclature' = 'TESTNOM'
  and (:'c5_l'::jsonb)->0->>'amount_source' = 'CALCULATED' and ((:'c5_l'::jsonb)->0->>'organism_amount')::numeric = 120
  and (t.claim(:'c5')->>'amount_claimed')::numeric = 120,
  '5/8. selected act: one line with act id / code, calculated 120 = amount claimed', :'c5_l');

-- ================================================================ 6/7. no act / manual line
select t.prev(:i3, :'cova', '{"label":"Consultation pour douleur thoracique","billed_amount":300}') as r \gset r6_
select t.check((:'r6_r'::jsonb)->>'reason_code' = 'ACT_NOT_IDENTIFIED' and (:'r6_r'::jsonb)->'act' = 'null'
  and (:'r6_r'::jsonb)->'missing_context' ? 'ACT',
  '6. no act selected: free text never becomes an act (ACT_NOT_IDENTIFIED)', :'r6_r');
select t.fails($$select create_insurance_claim_with_lines('e7000000-0000-4000-8000-000000000003', '$$ || :'cova' || $$', '[{"label":"Consultation","billed_amount":300}]')$$,
  'automatic calculation unavailable', '7. a manual line needs its organism amount');
select id as c7 from create_insurance_claim_with_lines(:i3, :'cova', '[
  {"label":"Consultation pour douleur thoracique","quantity":1,"billed_amount":300,"manual_organism_amount":150,"manual_reason":"Montant indiqué par l''organisme"},
  {"label":"Acte non vérifié","nomenclature":"TESTNOM","act_code":"T-DRAFT","billed_amount":100,"manual_organism_amount":20,"manual_reason":"Accord écrit"}]') \gset
select t.lines(:'c7') as l \gset c7_
select t.check((:'c7_l'::jsonb)->0->>'calculation_status' = 'MANUAL_REQUIRED' and (:'c7_l'::jsonb)->0->>'amount_source' = 'MANUAL'
  and (:'c7_l'::jsonb)->0->>'act_id' is null and (:'c7_l'::jsonb)->0->>'act_code' is null
  and ((:'c7_l'::jsonb)->0->>'patient_amount')::numeric = 150 and (:'c7_l'::jsonb)->0->>'manual_reason' = 'Montant indiqué par l''organisme',
  '7. manual line: MANUAL_REQUIRED, no act identified, organism 150 / patient 150, reason kept', :'c7_l');
select t.check((:'c7_l'::jsonb)->1->>'act_id' is null and (:'c7_l'::jsonb)->1->>'act_code' is null and (:'c7_l'::jsonb)->1->>'calculation_status' = 'MANUAL_REQUIRED',
  '7. a typed / unverified act code is never recorded as an identified act', :'c7_l');

-- ================================================================ 9/10. multiple lines + quantity
select id as c9 from create_insurance_claim_with_lines(:i4, :'cova', '[
  {"act_id":"60000000-0000-4000-8000-000000000001","label":"Acte test consultation","quantity":1,"billed_amount":300},
  {"act_id":"60000000-0000-4000-8000-000000000001","label":"Acte test consultation x3","quantity":3,"billed_amount":150,"manual_organism_amount":60,"manual_reason":"Quantité : saisie manuelle"},
  {"act_id":"60000000-0000-4000-8000-000000000002","label":"Acte test sans règle","quantity":2,"billed_amount":100,"manual_organism_amount":30,"manual_reason":"Barème communiqué"}]') \gset
select t.lines(:'c9') as l, t.snap(:'c9') as s \gset c9_
select t.check(jsonb_array_length(:'c9_l'::jsonb) = 3 and (t.claim(:'c9')->>'amount_claimed')::numeric = 120 + 60 + 30
  and (select sum((l->>'organism_amount')::numeric) from jsonb_array_elements(:'c9_l'::jsonb) l) = (t.claim(:'c9')->>'amount_claimed')::numeric
  and (t.rec(:i4)->>'org_share')::numeric = 210 and (t.rec(:i4)->>'patient_due')::numeric = 390 and t.rec(:i4)->>'status' = 'RECONCILED',
  '9. three act lines, each with its own calculation: sum 210 = amount claimed, invoice reconciled', :'c9_l');
select t.check(((:'c9_l'::jsonb)->1->>'quantity')::int = 3 and ((:'c9_s'::jsonb)->1->>'quantity')::int = 3
  and (:'c9_s'::jsonb)->1->>'reason_code' = 'QUANTITY_NOT_SUPPORTED' and (:'c9_s'::jsonb)->1->'organism_amount' = 'null'
  and ((:'c9_l'::jsonb)->2->>'quantity')::int = 2 and (:'c9_s'::jsonb)->2->>'reason_code' = 'QUANTITY_NOT_SUPPORTED',
  '10. quantity stored on line and snapshot; never multiplied (QUANTITY_NOT_SUPPORTED)', :'c9_s');

-- ================================================================ 11. coverage snapshot
select t.ctx(:'c5') as x, t.lines(:'c5') as l, t.snap(:'c5') as s \gset h_
select t.check((:'h_x'::jsonb)->'coverage'->>'scheme_code' = 'TEST_SCHEME' and (:'h_x'::jsonb)->'coverage'->>'membership_number' = '123456789'
  and (:'h_x'::jsonb)->'provider'->>'sector' = 'TEST_SECTOR' and (:'h_x'::jsonb)->'provider'->>'provider_category' = 'TEST_CATEGORY'
  and (:'h_x'::jsonb)->>'date_of_care' = '2026-09-27',
  '11. claim context snapshot: scheme, membership, provider sector / category, date of care', :'h_x');
select id as cova_v2 from upsert_patient_coverage(:'cova', :pA1, 'AMO', :'orga', '999', 'AYANT_DROIT', null, null, true, null, 'TEST_OTHER_SCHEME') \gset
select t.as_(:docA);
select set_insurance_provider_context('TEST_SECTOR_2', 'TEST_CATEGORY_2') \gset x_
select t.as_(:secA);
select t.check(:'cova_v2' <> :'cova' and t.cov(:'cova')->>'scheme_code' = 'TEST_SCHEME' and t.cov(:'cova')->>'is_active' = 'false'
  and t.cov(:'cova_v2')->>'scheme_code' = 'TEST_OTHER_SCHEME',
  '11. changing a coverage used by a claim creates a new version; the old one keeps its scheme');
select t.check(t.ctx(:'c5') = :'h_x'::jsonb and t.lines(:'c5') = :'h_l'::jsonb and t.snap(:'c5') = :'h_s'::jsonb
  and t.claim(:'c5')->>'coverage_id' = :'cova' and t.claim(:'c5')->>'membership_number_snapshot' = '123456789',
  '11/16. later coverage + provider changes leave claim, lines, snapshots, organization, membership and scheme unchanged');

-- ================================================================ 12. existing manual claim
select id as c12 from create_insurance_claim(:i5, :'cova_v2', 200) \gset
select t.check(jsonb_array_length(t.lines(:'c12')) = 0 and t.ctx(:'c12') is null and t.rec(:i5)->>'status' = 'RECONCILED'
  and (t.rec(:i5)->>'org_share')::numeric = 200, '12. claim created by the manual RPC: valid, no lines, no context row, reconciled');
reset role;
select t.fails($$insert into insurance_claim_contexts (claim_id, clinic_id, patient_id, organization_id, date_of_care, coverage, provider)
  select id, clinic_id, patient_id, organization_id, current_date, '{}', '{}' from insurance_claims where id = '$$ || :'c12' || $$'$$,
  'with its claim only', '12. no context can be attached later to an existing claim');
select t.fails($$update insurance_claim_contexts set coverage = '{}' where claim_id = '$$ || :'c5' || $$'$$, 'immutable', '11. claim context immutable');
set role authenticated;
select t.as_(:secA);
select t.check((select count(*) = 0 from invoice_financials where reconciliation_status <> 'RECONCILED'), 'ALL invoices RECONCILED');

-- ================================================================ 14. clinic isolation
select t.as_(:secB);
select t.fails($$select get_insurance_context('e7000000-0000-4000-8000-000000000001', '$$ || :'cova' || $$')$$, 'cross-clinic|not authorized', '14. other clinic: no context');
select t.fails($$select * from search_insurance_acts('e7000000-0000-4000-8000-000000000001', null)$$, 'cross-clinic|not authorized', '14. other clinic: no act search on this invoice');
select t.check((select count(*) from insurance_claim_contexts) = 0 and (select count(*) from insurance_claim_lines) = 0,
  '14. other clinic sees no claim context or line');
select t.fails($$select set_insurance_provider_context('X', 'Y')$$, 'not authorized', '14. a secretary of another clinic cannot set provider context');
reset role;
set role anon;
select t.fails($$select count(*) from insurance_claim_contexts$$, 'permission denied', 'anon: no claim contexts');
select t.fails($$select get_insurance_context(null, null)$$, 'permission denied', 'anon: no context RPC');
select t.fails($$select * from search_insurance_acts(null, null)$$, 'permission denied', 'anon: no act search');
select t.fails($$select set_insurance_provider_context('X', 'Y')$$, 'permission denied', 'anon: no provider context RPC');
reset role;

\set QUIET 0
select n, case when ok then 'PASS' else 'FAIL' end as result, label, case when not ok then detail end as detail from t.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
