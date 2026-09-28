# Stage 4B — Moroccan AMO rule engine: source audit (Phase 0 stop)

Written 2026-09-27. Complements `stage-4a-amo-domain-spec.md`.

## Outcome

**STOPPED AT PHASE 0.** No authoritative source document could be obtained. As the Stage 4B
brief requires:

- no migration was written, and no rule, tariff or seed value was created;
- search-engine excerpts are **not** treated as source text;
- the organism share stays **manual** ("Montant saisi manuellement"), exactly as today.

### Access attempts (2026-09-27)

| Host | `curl` via proxy | WebFetch |
|---|---|---|
| www.anam.ma, anam.ma, inpe.anam.ma | 403 on CONNECT (policy denial) | EGRESS_BLOCKED |
| www.cnss.ma | 403 on CONNECT | EGRESS_BLOCKED |
| www.cnops.org.ma | 403 on CONNECT | not tried (same policy) |
| www.acaps.ma | 403 on CONNECT | not tried |
| www.sgg.gov.ma (Bulletin Officiel) | 403 on CONNECT | not tried |
| www.sante.gov.ma | 403 on CONNECT | not tried |
| www.maroc.ma | 403 on CONNECT | not tried |

### Two ways to unblock

1. **Allow the hosts.** Add them to the environment's network allow-list: cloud environment menu in
   the session title bar → Edit → Network access. Needed: `anam.ma`, `www.anam.ma`, `inpe.anam.ma`,
   `www.cnss.ma`, `www.cnops.org.ma`, `wtemps.cnops.org.ma`, `www.acaps.ma`, `www.sgg.gov.ma`,
   `www.sante.gov.ma`, `www.maroc.ma`. Or pick a broader access level.
2. **Provide the documents.** Put the official PDFs in `docs/insurance/sources/` (outside
   production data). Each file will be registered with a SHA-256 checksum, its retrieval date and
   the person who supplied it.

---

## A. Sources obtained

**None.**

Excerpts shown by a search engine for pages on official domains were used in Stage 4A to map the
domain. They are **not** sources in the sense of this stage: the full text, version and effective
date could not be checked.

## B. Sources still missing (source register, all `NOT_OBTAINED`)

The register format required by Phase 1, filled in as far as it can be without the documents.
Unknown fields stay empty. They are never guessed.

| source_id | Title (as expected) | Issuing body | Doc type | Publication date | Effective date | Expected location | Needed for | Status |
|---|---|---|---|---|---|---|---|---|
| SRC-LAW-65-00 | Loi n° 65-00 portant code de la couverture médicale de base (consolidated) | Parliament / SGG | Law | 2002 (BO) | | sgg.gov.ma | scope, panier de soins (art. 7), accord préalable (art. 13) | NOT_OBTAINED |
| SRC-LAW-54-23 | Loi n° 54.23 modifiant la loi 65-00 (CNOPS → CNSS) | Parliament / SGG | Law | 2026-01-29 (BO n°7478, per press, unverified) | 2027-02-01 (per press, unverified) | sgg.gov.ma | manager of the public-sector scheme over time; transitional rules | NOT_OBTAINED |
| SRC-DEC-2-05-736 | Décret n° 2-05-736 (taux de couverture AMO) | Government / SGG | Decree | 2005 | | sgg.gov.ma | coverage rates per scheme and act category | NOT_OBTAINED |
| SRC-DEC-AMO-TNS | Decrees applying AMO to TNS (per category) | Government / SGG | Decrees | | | sgg.gov.ma | TNS rates, waiting period | NOT_OBTAINED |
| SRC-DEC-AMO-TADAMON | Texts for AMO Tadamon (ex-RAMED) | Government / SGG | Law / decrees | | | sgg.gov.ma | Tadamon rates, tiers payant in public hospitals | NOT_OBTAINED |
| SRC-DEC-AMO-ACHAMIL | Texts for AMO Achamil | Government / SGG | Law / decrees | | | sgg.gov.ma | Achamil rates | NOT_OBTAINED |
| SRC-ALD-LIST | Arrêté fixing the ALD/ALC list and exoneration rules | Ministry of Health / SGG | Arrêté | | | sgg.gov.ma, sante.gov.ma | ALD/ALC exoneration | NOT_OBTAINED |
| SRC-ARR-177-06 | Arrêté n° 177-06 (NGAP) with its annexes | Ministry of Health | Arrêté | 2006 | | sante.gov.ma | acts, key letters, coefficients | NOT_OBTAINED |
| SRC-NABM | Nomenclature des actes de biologie médicale | Ministry of Health | Arrêté | 2006 | | sante.gov.ma, cnss.ma | biology acts (B) | NOT_OBTAINED |
| SRC-CONV-CNSS-MG-2020 | Convention nationale CNSS / médecins généralistes du secteur privé, with its TNR annex | CNSS, ANAM | Convention + tariff annex | signed 2020-01-13 (press) | BO + 60 days (press) | cnss.ma, anam.ma, BO | TNR for GPs | NOT_OBTAINED |
| SRC-CONV-CNSS-MS-2020 | Convention nationale CNSS / médecins spécialistes du secteur privé, with its TNR annex | CNSS, ANAM | Convention + tariff annex | signed 2020-01-13 (press) | BO + 60 days (press) | cnss.ma, anam.ma, BO | TNR for specialists | NOT_OBTAINED |
| SRC-CONV-CNSS-CLIN-2020 | Convention nationale CNSS / cliniques privées, with its TNR annex | CNSS, ANAM | Convention + tariff annex | signed 2020-01-13 (press) | | cnss.ma, anam.ma | TNR for establishments | NOT_OBTAINED |
| SRC-CONV-2026 | Revised national convention(s) after the 2026 TNR agreement | CNSS, ANAM | Convention | not known whether signed | | anam.ma, BO | current TNR, if published | NOT_OBTAINED (existence unknown) |
| SRC-CONV-CNOPS | CNOPS national conventions and TNR grid in force | CNOPS, ANAM | Convention + grid | | | cnops.org.ma, anam.ma | TNR for the public-sector scheme until the transfer | NOT_OBTAINED |
| SRC-ANAM-GRID-2006 | Grille n°1 — Tarifs des lettres clés (annexe convention 2006) | ANAM | Tariff annex | 2006 | | anam.ma grilleannexe1.pdf | historical TNR only (superseded) | NOT_OBTAINED |
| SRC-ANAM-FSM | Feuille de soins maladie, current ANAM model + filling guide | ANAM | Standardized form | | | anam.ma | required document fields (Phase 12) | NOT_OBTAINED |
| SRC-ANAM-DAP | Demande d'accord préalable, current model + list of acts concerned | ANAM | Standardized form | | | anam.ma | prior authorization (Phase 11) | NOT_OBTAINED |
| SRC-CNSS-PEC | CNSS prise en charge procedure (prestations, requester, delay, required information) | CNSS | Procedure | | | cnss.ma | prise en charge (Phase 11) | NOT_OBTAINED |
| SRC-CNSS-TP | CNSS tiers-payant conditions (who, which prestations, which agreement) | CNSS | Procedure | | | cnss.ma | tiers-payant eligibility (Phase 10) | NOT_OBTAINED |
| SRC-CNOPS-TP | CNOPS "Intégrer le mode tiers payant" | CNOPS | Procedure | | | wtemps.cnops.org.ma | tiers-payant eligibility (Phase 10) | NOT_OBTAINED |
| SRC-ANAM-INPE | Guide INPE (2020 or later) | ANAM | Guide | 2020 | | anam.ma | INPE format and scope | NOT_OBTAINED |
| SRC-ACAPS-CMC | ACAPS rules on complementary health insurance | ACAPS | Regulation / circular | | | acaps.ma | what is regulated vs purely contractual | NOT_OBTAINED |
| SRC-LAW-55-19 | Loi n° 55-19 (simplification des procédures), provisions on delays | Parliament / SGG | Law | 2020 | | sgg.gov.ma | filing / reimbursement deadlines | NOT_OBTAINED |
| SRC-CONTRACT-* | Each complementary insurer's contract (per clinic / patient) | Insurer | Contract | | | from the insurer / patient | complementary layer (Phase 9) | NOT_OBTAINED (not public; per contract) |

Once obtained, each row gets: `url`, `version`, `retrieval_date`, `sha256`, `retrieved_by`.

## C. Verified rules

**None.** Nothing may enter production.

## D. Unverified candidate rules

Recorded so that the audit can confirm or reject them. **All are `UNVERIFIED` and may not be
implemented.**

| # | Candidate rule | Where it was seen | Effective date | Scope | Confidence | Status |
|---|---|---|---|---|---|---|
| R1 | Reimbursement basis = TNR (not the billed amount) | anam.ma / cnops excerpts | unknown | all AMO | medium (consistent across excerpts) | UNVERIFIED |
| R2 | CNSS ambulatory care: 70% of the TNR | cnss.ma FAQ excerpt | unknown | CNSS, ambulatory | low (FAQ excerpt, not the decree) | UNVERIFIED |
| R3 | CNOPS consultations: 80% of the TNR | excerpt citing decree 2-05-736 art. 1 | unknown | CNOPS, consultations | low | UNVERIFIED |
| R4 | ALC exonerated at 100%; ALD 77–97%; ≥ 90% in public establishments | cnss.ma excerpt | unknown | CNSS, ALD/ALC | low | UNVERIFIED |
| R5 | TNR effective 60 days after BO publication | press (2020) | per convention | CNSS 2020 conventions | low | UNVERIFIED |
| R6 | Care is priced at the TNR in force on the date of care | no source; usual practice | n/a | all | none: design assumption | UNVERIFIED (the engine uses this as its convention, see H) |
| R7 | Filing within 60 days of care | cnss.ma excerpt | unknown | CNSS | low | UNVERIFIED |
| R8 | CNSS answers a prise en charge request within 48 business hours | cnss.ma excerpt | unknown | CNSS hospitalisation | low | UNVERIFIED |
| R9 | Accord préalable needed for multi-session acts and care abroad | excerpt citing law 65-00 art. 13 | 2005 | AMO | low (list incomplete) | UNVERIFIED |
| R10 | INPE: 9 digits, mandatory on standardized AMO documents | ANAM guide excerpt | 2020 | all providers | medium | UNVERIFIED |
| R11 | Public-sector scheme managed by CNSS from 2027-02-01 | press citing law 54.23 | 2027-02-01? | public sector | low (press) | UNVERIFIED |

### Conflicts and ambiguities flagged (not resolved)

- **C1 — R2 vs R3 vs law 54.23.** CNSS at 70% and CNOPS at 80% (if confirmed) apply to different
  schemes, so they don't conflict today. After the transfer, which rate the **public-sector scheme**
  keeps under CNSS management is unknown. It must come from law 54.23 or its decrees. Don't pick
  one.
- **C2 — R4.** "ALD 77–97%" is a range, not a rule. The per-disease or per-case rate is needed. It
  cannot be modelled as one value.
- **C3 — TNR values.** The 2006 ANAM grid was revised by the 2020 conventions, and a 2026 revision is
  under way. Three possible versions exist; none has been read. None can be used.
- **C4 — R1 with a flat tariff for medicines or forfaits.** The basis may be the public sale price or
  a forfait, not a TNR. Unknown for cabinet acts.

## E. TNR structure (proposed, pending the audit)

Unchanged from Stage 4A §C–D, with the Stage 4B fields added:

- `tnr_type`: `LETTER_COEFFICIENT` (unit value × coefficient) or `FLAT` (fixed reference amount).
  **Other types are allowed** if the texts show them (e.g. forfait per session, price per unit). The
  enum is extended only after the audit.
- Keyed by `sector` (private/public), `provider_category` (GP, specialist + specialty where the grid
  requires it, clinic, lab...), `organization` / `scheme` when grids differ, and
  `effective_from/until`.
- Every row carries `source_id` + `source_version`.

**Open structural questions only the documents can answer:** Are TNR values per organization (CNSS
vs CNOPS) or national? Does the specialist grid vary by specialty? Are there modifiers (night,
Sunday, emergency, home visit) and how are they priced?

## F. Act / nomenclature structure (proposed, pending the audit)

- `nomenclature_acts`: `nomenclature` (NGAP / NABM / CCAM later), `act_code`, `label`,
  `act_category`, `key_letter`, `coefficient`, `requires_prior_authorization`,
  `effective_from/until`, `source_id`, `source_version`.
- The clinic catalogue (`actes_catalogue`) gets an optional link to a nomenclature act. Its `prix`
  stays the **billed amount** and is never replaced by the TNR.
- **Unknown until SRC-ARR-177-06 is read:** the exact coding of NGAP acts (whether a stable act code
  exists or only letter + coefficient + label), and the modifiers.

## G. Proposed migrations (NOT written, blocked by Phase 0)

Written only after C has at least one verified rule, **or** if you approve building the empty
structure first (see "Decision needed" below). All additive; the Stage 1–3.5 tables, triggers and
the `invoice_financials` view are not modified.

| # | Migration | Content |
|---|---|---|
| M1 | `insurance_sources` | The register above: `source_id`, title, issuing_body, doc_type, publication_date, effective_date, url, version, retrieval_date, sha256, storage path, notes. Global, read-only to clinics. |
| M2 | `coverage_schemes`, `scheme_managers` | Schemes separated from organizations; manager over time (law 54.23 = a new row). `insurance_organizations.reference_code` + `patient_coverages.scheme_code` (both nullable). |
| M3 | `nomenclature_acts`, `tariff_items` | E and F. Each row has `source_id`, `source_version` and `verification_status`. |
| M4 | `insurance_rules` | `scheme_code`, `organization_code`/`organization_id`, `act_code`/`act_category`, `rule_type` (RATE, FIXED_AMOUNT, CEILING, EXCLUSION, EXONERATION, PRIOR_AUTHORIZATION, TIERS_PAYANT_ELIGIBILITY), `coverage_rate`, `fixed_amount`, `ceiling_amount`/`ceiling_period`, `conditions jsonb`, `requires_prior_authorization`, `requires_tiers_payant`, `effective_from/until`, `source_id`, `source_version`, `verification_status` (DRAFT / UNVERIFIED / VERIFIED / REJECTED / SUPERSEDED), `verified_by/at`. An exclusion constraint forbids two VERIFIED rules with the same scope and overlapping dates. |
| M5 | `tiers_payant_agreements` | Conditional eligibility (Phase 10): organization × provider / establishment × prestation × agreement reference × dates × source. No row means patient pays (current behaviour). |
| M6 | `insurance_claim_lines` | Per-line amounts (billed, TNR, basis, organism, patient), `rule_id`, `tariff_item_id`, `calculation_id`, `calculation_status`. Trigger: when a claim has lines, `amount_claimed = Σ organism_amount`, written only by the sync function (Stage 3.5 guard pattern). A claim without lines keeps manual `amount_claimed`. |
| M7 | `insurance_calculations` | Immutable snapshot (I). Insert-only: update/delete refused by trigger. |
| M8 | `insurance_manual_overrides` | Phase 14: line, automatic status kept, manual amount, reason (required), user, timestamp. Never touches rule or tariff rows. |
| M9 | RPCs | `calculate_claim_lines(...)` (read-only, writes a snapshot), `create_claim_with_lines(...)`, `override_claim_line(...)`: SECURITY DEFINER, clinic-scoped, audited. |

**No seed migration.** Verified values would come later through a separate, reviewed data
migration per source, each with its regression test (Phase 16).

## H. Calculation algorithm

```
calculateInsuranceLine(act, billedAmount, coverage, dateOfCare):
  scheme   = coverage.scheme_code                                  -- null → MANUAL_REQUIRED('NO_SCHEME')
  manager  = scheme_managers at dateOfCare                         -- none → MANUAL_REQUIRED('NO_MANAGER')
  if coverage validity dates exclude dateOfCare → MANUAL_REQUIRED('COVERAGE_NOT_VALID_ON_DATE')
  nomAct   = act.nomenclature_act                                  -- none → MANUAL_REQUIRED('ACT_NOT_MAPPED')

  tariffs  = VERIFIED tariff_items matching (nomAct, sector, provider_category, manager/scheme) at dateOfCare
  if 0 → MANUAL_REQUIRED('NO_VERIFIED_TNR')
  if >1 at the same specificity → CONFLICT (never pick one)
  tnr      = tariff.type = LETTER_COEFFICIENT ? unit_value × coefficient : flat_amount

  rules    = VERIFIED insurance_rules matching (scheme, manager, act/category, conditions) at dateOfCare
  if EXCLUSION matches → CALCULATED with organism 0 and reason = that rule   -- explicit 0 only from a rule
  if no RATE/FIXED rule → MANUAL_REQUIRED('NO_VERIFIED_RULE')
  if >1 at the same specificity → CONFLICT

  basis    = min(billedAmount, tnr)
  organism = rule.type = RATE ? round(basis × rate, rounding rule) : rule.fixed_amount
  organism = min(organism, ceiling if any, basis)
  patient  = billedAmount − organism
  if rule.requires_prior_authorization and no authorization → status WARNING_PRIOR_AUTH (amount shown, filing blocked)
  if claim is TIERS_PAYANT and no matching tiers_payant_agreement → WARNING_NO_TIERS_PAYANT_AGREEMENT

  return { billed_amount, tnr_amount: tnr, reimbursement_basis: basis, organism_amount: organism,
           patient_amount: patient, rule_id, tariff_item_id, source_ids,
           calculation_status, explanation: [ordered human-readable steps with source refs] }
```

- `calculation_status`: `CALCULATED`, `MANUAL_REQUIRED(reason)`, `CONFLICT(ids)`, `CALCULATED_WITH_WARNINGS`.
- **Never** a default of 0%, 100% or TNR = billed. A missing value always gives `MANUAL_REQUIRED`.
- The rounding rule itself must come from a verified source. Without one, rounding is to the
  centime, and the choice is recorded in the explanation as an engine convention, not a legal rule.
- **Complementary layer:** a separate call, only with a verified contract rule for that coverage, on
  what remains after the AMO **calculated** share. It is never triggered by an AMO rejection. No
  contract rule means `MANUAL_REQUIRED`.

## I. Historical snapshot structure (`insurance_calculations`)

```
id, clinic_id, invoice_id, claim_id (null for an estimate), claim_line_id,
date_of_care, calculated_at, calculated_by, engine_version,
inputs    jsonb  -- act (code, label, letter, coefficient), billed amount, coverage (id, type, scheme,
                 --   organization, validity) AS OF calculation, provider category, sector, situation
tariff    jsonb  -- tariff_item_id, tnr_type, unit_value / flat_amount, effective_from/until, source_id, source_version
rules     jsonb  -- [{rule_id, rule_type, rate/fixed/ceiling, conditions, effective_from/until, source_id, source_version}]
sources   jsonb  -- [{source_id, title, issuing_body, publication_date, sha256}]
outputs   jsonb  -- tnr, basis, organism, patient, status, warnings
explanation jsonb -- ordered steps shown in the UI
```

Values are **copied**, not only referenced. A later change of a rule, tariff or patient coverage
cannot alter the snapshot. The table is insert-only, enforced by trigger, with a test.

## J. UI changes (after the migrations exist)

- `CreateClaimModal`: an optional "Actes" section (list acts, date of care, ALD flag). The **"Calculer"**
  button runs the engine. Per line: Acte / Honoraires / TNR / Base de remboursement / Règle / Part
  organisme / Part patient / Source / En vigueur depuis. The footnote says it is an estimate, not a
  guarantee of reimbursement.
- `MANUAL_REQUIRED` lines show the reason ("Aucune règle vérifiée pour cet acte à cette date") and
  an amount field labelled **"Montant saisi manuellement"**.
- Override of a calculated line: requires a reason. The automatic value stays visible next to the
  manual one.
- Claim detail: an "Explication du calcul" panel that reads the snapshot, not the live rules.
- Once lines exist, the claim total is read-only.
- No "demande de prise en charge" button, no eligibility status. Coverage stays shown as
  "Informations de couverture enregistrées".
- An admin-only read view of the source register and rule statuses. No clinic editing of national
  rules.

## K. Test matrix (to be implemented with M1–M9)

Test rules and tariffs live **only in test fixtures**, clearly fictitious (e.g. scheme `TEST_SCHEME`,
source `SRC-TEST-*`), never in migrations.

| # | Case | Expected |
|---|---|---|
| 1 | Exact verified rule + tariff match | CALCULATED; amounts, rule_id, sources in the result |
| 2 | No rule match | MANUAL_REQUIRED('NO_VERIFIED_RULE'); organism not set |
| 3 | Historical rule (care before a rule change) | the older rule's values |
| 4 | Future rule (effective after the date of care) | ignored |
| 5 | Act-level calculation | per-line basis = min(billed, TNR) |
| 6 | Several claim lines | Σ organism = amount_claimed; total read-only |
| 7 | Several organizations on one invoice | independent claims; Stage 3.5 invoice cap still refuses an over-allocation |
| 8 | Complementary coverage | computed only with a contract rule; an AMO rejection does not create a complementary amount |
| 9 | Manual override | reason required; auto status kept; rule rows unchanged; label "Montant saisi manuellement" |
| 10 | Tiers-payant eligibility | no agreement → warning, patient-pays default; matching agreement → no warning |
| 11 | Prior authorization rule | amount calculated, filing blocked until an authorization is recorded |
| 12 | Rule conflict (2 verified rules, same specificity) | CONFLICT, no amount |
| 13 | Expired rule | ignored after effective_until |
| 14 | Overlapping verified rules | insert refused by the exclusion constraint |
| 15 | Patient coverage changed after calculation | existing snapshot unchanged; a new calculation uses the new coverage |
| 16 | Historical claim after a rule update | claim lines and snapshot unchanged |
| 17 | Snapshot immutability | UPDATE/DELETE on `insurance_calculations` refused |
| + | UNVERIFIED / DRAFT rule present | ignored by the engine (same as no match) |
| + | Stage 3.5 regression | existing reconciliation suite still green; `invoice_financials` unchanged |

---

## Decision needed

1. **Unblock sources**: allow the hosts, or drop the official PDFs into `docs/insurance/sources/`.
2. Optionally, **approve building the empty engine now** (M1–M9 with no rule data, every calculation
   returning `MANUAL_REQUIRED`, full test suite on fictitious fixtures). This would not change what
   users see, apart from the "Montant saisi manuellement" label, and it lets verified data plug in
   later without new code. Per the brief, this is **not** started without your approval.

---

## Stage 4D attempt (2026-09-28): stopped, no source obtained

- `docs/insurance/sources/` does not exist: no document was supplied.
- Every official host still answers **403 on CONNECT** from the environment proxy: `www.anam.ma`,
  `anam.ma`, `inpe.anam.ma`, `www.cnss.ma`, `www.cnops.org.ma`, `wtemps.cnops.org.ma`, `www.acaps.ma`,
  `www.sgg.gov.ma`, `www.sante.gov.ma`, `www.maroc.ma`.
- As the Stage 4D brief requires, nothing was loaded. Every register entry in §B stays
  **SOURCE_NOT_OBTAINED**, and every candidate rule in §D stays out of the database.
- Checked: production reference tables are empty after all migrations (sources, schemes, acts,
  tariffs, rules, agreements = 0). No migration or application code references the TEST fixtures
  (`TESTNOM`, `T-*`, `SRC-TEST-*`).
