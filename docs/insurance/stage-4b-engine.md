# Stage 4B — insurance rules engine (empty)

Migration: `supabase/migrations/20261001000000_insurance_rules_engine.sql`.
Tests: `scripts/db-tests/insurance/` (fixtures are fictitious, test-only).

**State: the engine exists; it holds no regulatory data.** Every calculation returns
`MANUAL_REQUIRED`, and the organism share is entered by hand with a reason and shown as
*Montant saisi manuellement*.

## Tables

| Table | Scope | Content |
|---|---|---|
| `insurance_rule_sources` | national | Archived official documents: issuing body, title, type, dates, URL, version, SHA-256, retrieval date |
| `insurance_coverage_schemes` | national | Legal schemes (régimes). `patient_coverages.scheme_code` points here (nullable). |
| `insurance_act_catalog` | national | Reference acts (nomenclature, code, label, category), versioned by date |
| `insurance_tariffs` | national | TNR: `KEY_LETTER` (letter value × coefficient) or `FLAT`, scoped by sector, provider category, scheme and organization type |
| `insurance_rules` | national, or one clinic's contract | Coverage rate / fixed amount / explicit exclusion, ceiling, prior authorization flag, tiers-payant eligibility, versioned by `rule_key` + `version` |
| `insurance_tiers_payant_agreements` | clinic | Evidence of a tiers-payant agreement (organization × provider × acts × dates) |
| `insurance_calculations` | clinic | Immutable snapshot per claim line: inputs, act, tariff, rule and sources copied by value, output, explanation, manual entry |
| `insurance_claim_lines` | clinic | Per-line breakdown of a claim. Σ `organism_amount` = `amount_claimed` (checked at commit). |

The engine uses a reference row only when `verification_status = 'VERIFIED'`. The database accepts
VERIFIED only with an archived source (checksum + retrieval date) and a reviewer. Once verified, a
row is never edited or deleted: it can only be closed (`effective_until`) or superseded.

## Adding the first verified rule (once official sources are obtained)

1. **Archive the document.** Store the PDF outside the app (e.g. `docs/insurance/sources/`) and
   compute its SHA-256.
2. **Register the source.** A reviewed data migration inserts one `insurance_rule_sources` row per
   document, with its checksum and `retrieved_at`.
3. **Transcribe the text into reference rows:**
   - acts in `insurance_act_catalog`;
   - the TNR in `insurance_tariffs`;
   - the rates in `insurance_rules`;
   - the schemes in `insurance_coverage_schemes`.

   Each row carries its `source_id` and its effective dates, as stated in the text (not the
   signature date). Insert them as `UNVERIFIED` first.
4. **Second-person review.** Someone other than the transcriber checks each row against the
   document, then sets `VERIFIED` with `verified_by` / `verified_at`. This happens in the same
   reviewed migration or a follow-up one.
5. **Regression test.** For each rule, add a case to `scripts/db-tests/insurance/` that reproduces a
   worked example from the source, and run the Stage 3.5 and 4B matrices.
6. **Configure the inputs (Stage 4C, done).** The UI and RPCs exist, but configuration only makes
   sense with verified codes:
   - the patient's AMO scheme (`patient_coverages.scheme_code`, coverage form);
   - the cabinet sector (`cabinets.provider_sector_code`) and the practitioner category
     (`profiles.provider_category_code`), set in Paramètres → Contexte assurance.

   When the reference data is loaded, these codes must match the codes used in
   `insurance_coverage_schemes` and in the tariff and rule scopes.
7. **Acts on claims (Stage 4C, done).** Claim lines reference a verified `insurance_act_catalog` act
   selected by the user, or are manual lines. Nothing is inferred from free text.

Conditional rules (ALD, etc.) cannot be VERIFIED until an engine version that evaluates
`conditions` exists. The `insurance_rules_conditions_supported` check enforces this.

## Stage 4C: insurance context and act capture

Migration: `supabase/migrations/20261002000000_insurance_context_and_acts.sql` (still no regulatory
data). Tests: `scripts/db-tests/insurance/context_and_acts.sql`.

- **Scheme.** `patient_coverages.scheme_code` is a configurable code (no foreign key while the
  national list is empty). It is edited in the coverage form through `upsert_patient_coverage`, and
  only kept on AMO coverages. On a coverage already used by a claim, a scheme change creates a new
  coverage version.
- **Provider.** `cabinets.provider_sector_code` and `profiles.provider_category_code` are
  configurable codes, changed only through `set_insurance_provider_context` (doctor or admin,
  audited). The specialty is reported but never used to derive a category.
- **Engine version 2** answers MANUAL_REQUIRED, with an explicit reason, when any of these is
  missing: act ("acte non rattaché…"), scheme for the AMO layer ("Régime AMO non renseigné."), a
  scheme absent from the reference, sector, or category. It also answers MANUAL_REQUIRED for any
  quantity above 1 (stored, never multiplied). Every missing input is listed in `missing_context`.
  An explicitly selected act stays identified whatever else is missing.
- **Tiers payant.** The answer carries the establishment, practitioner and organization, and whether
  a verified agreement is on file. It stays UNVERIFIED without a verified rule, so AMO, CNSS, CNOPS
  or a complementary insurer never implies eligibility.
- **Claim lines.** One line per act selected from the verified catalog (`search_insurance_acts`,
  valid on the date of care), or a manual line. Each line has a quantity, fees, the organism amount
  (calculated or "Montant saisi manuellement" with a reason) and the patient share. Σ organism =
  `amount_claimed`. The act is recorded on a line only when the engine resolved a verified one.
- **Claim context.** `insurance_claim_contexts` freezes the coverage (scheme, organization,
  membership, beneficiary, validity) and the provider context of each new claim. Claims created
  before this stage have none, and still read "Montant saisi manuellement, sans détail par acte".
