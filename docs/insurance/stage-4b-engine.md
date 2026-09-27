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
6. **Record the inputs the rules need:**
   - the scheme on patient coverages (`scheme_code`), with a field in the coverage form;
   - the sector and provider category of the clinic or practitioner. Rules or tariffs scoped on
     them cannot match until then; the engine reads them from its `context` argument.
7. **Identify acts on invoices.** Link `actes_catalogue` or invoice lines to reference acts, so the
   modal can send act codes. Today it sends the invoice as one line with no act, so the answer is
   always `ACT_NOT_IDENTIFIED`.

Conditional rules (ALD, etc.) cannot be VERIFIED until an engine version that evaluates
`conditions` exists. The `insurance_rules_conditions_supported` check enforces this.
