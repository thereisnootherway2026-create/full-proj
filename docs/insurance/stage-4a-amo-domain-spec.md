# Stage 4A — Moroccan AMO / TNR domain model

Research and architecture only. **No code, migration, rule or tariff data is part of this stage.**
The organism share stays **entered manually** until the Stage 4B rules engine is implemented and
validated.

Status of this document: draft for review, written 2026-09-27.

---

## 0. How to read the sources in this document

Every factual rule below carries a source tag:

| Tag | Meaning |
|---|---|
| **[OFF]** | Seen on an official domain (anam.ma, cnss.ma, cnops.org.ma, acaps.ma, sante.gov.ma, sgg.gov.ma, maroc.ma). **Only the search-engine excerpt was read**: the full page could not be fetched (see below). |
| **[PRESS]** | National press reporting an official act (Médias24, Le Matin, LeBrief, EcoActu). Used only for dates and events; must be confirmed against the Bulletin Officiel before any rule is built on it. |
| **[TBV]** | To be verified. Plausible, but no official text was read. **Nothing tagged [TBV] may become a rule.** |

**Research limitation.** This environment's network policy blocks direct access to the official
Moroccan hosts: `anam.ma`, `inpe.anam.ma`, `cnss.ma`, `cnops.org.ma`, `acaps.ma`, `sgg.gov.ma`,
`sante.gov.ma`, `maroc.ma`. Findings come from search-engine excerpts of pages on those domains. No
PDF (conventions, TNR grids, decrees) was read in full. So:

- **No numeric value in this document is a validated rule.** Figures appear only to show the
  *shape* of the data (what a rule has to store), each with its source.
- Stage 4B must start by getting the primary texts listed in §O and storing them as rule sources.

---

## Summary: the seven amounts (they are never the same number)

The rules engine and the UI must keep these apart. Almost every insurance billing bug comes from
merging two of them.

| # | Amount | Definition | Who sets it | Where it lives (future) |
|---|---|---|---|---|
| 1 | **Montant facturé** (billed amount) | What the doctor charges for the act. Free within the law and the convention. | Doctor | `facture_lignes` / `insurance_claim_lines.billed_amount` |
| 2 | **Tarif de référence (TNR)** / reference amount | Nationally negotiated tariff for the act. The regulatory ceiling of the reimbursement *basis*. | Convention nationale + ANAM (versioned) | `insurance_claim_lines.reference_amount`, computed from `tariff_items` |
| 3 | **Base de remboursement** (reimbursement basis) | Amount the rate applies to: normally `min(billed, TNR)`. For medicines, the public sale price or reference price. | Rule | `insurance_claim_lines.reimbursement_basis` |
| 4 | **Part organisme AMO** (organism payable) | `basis × rate` (rate depends on scheme, act and situation such as ALD/ALC), possibly capped. | Rule, then the organism's decision | `insurance_claim_lines.organism_amount` → Σ = `insurance_claims.amount_claimed` |
| 5 | **Part patient** (patient responsibility) | `billed − organism payable` = ticket modérateur (basis − AMO) + dépassement (billed − basis). | Derived | `insurance_claim_lines.patient_amount` |
| 6 | **Part complémentaire** (complementary coverage) | Part of #5 taken over by a mutuelle or private insurer, per its contract formula. | Complementary contract | a separate claim on the complementary organization, with its own lines |
| 7 | **Montant reçu** (amount actually received) | What the organism actually paid. Can be less than #4 (rejection, partial payment). | Organism | Already modelled: `insurance_settlements` ledger → `insurance_claims.amount_received` |

Invariant per act line:
`billed = organism_amount + complementary_amount + patient_final_amount`, and
`received ≤ organism_amount` (the difference is outstanding, or rejected via
`insurance_claim_rejections`).

---

## A. Moroccan insurance concepts

| Concept | Meaning | Source |
|---|---|---|
| **AMO** (Assurance Maladie Obligatoire) | Mandatory basic health insurance created by **law 65-00** (Code de la couverture médicale de base). Covers a *panier de soins* defined in law 65-00 art. 7. | [OFF] anam.ma; law 65-00 |
| **ANAM** (Agence Nationale de l'Assurance Maladie) | Regulator of the AMO. Oversees national conventions and the TNR, assigns the **INPE**, publishes standardized forms (feuille de soins, demande d'accord préalable). | [OFF] anam.ma |
| **Organisme gestionnaire** | Body that manages a scheme and pays: **CNSS** and **CNOPS** (see §B). | [OFF] cnss.ma, cnops.org.ma |
| **Régime / scheme** | Legal coverage regime of the insured (AMO salariés, AMO TNS, AMO Tadamon, AMO Achamil, public sector...). A scheme is **not** an organization: one organization manages several schemes, and a scheme can change manager (law 54.23). | [OFF] cnss.ma; [PRESS] law 54.23 |
| **Assuré / ayant droit** | Insured person, or beneficiary through the insured (spouse, children within an age limit). Law 54.23 raises the children's age limit from 26 to 30. | [OFF] cnss.ma; [PRESS] age limit |
| **Convention nationale** | Agreement between the AMO managers and a category of providers (private GPs, private specialists, private clinics...) concluded under ANAM. It fixes the **TNR** and the obligations of both sides. | [OFF] cnss.ma/fr/content/conventions-nationales; anam.ma/anam/regulation/tarification-nationale-de-reference/ |
| **TNR** (Tarification Nationale de Référence) | Reference tariff per act. The basis of reimbursement or prise en charge. | [OFF] anam.ma |
| **NGAP / NABM** | Nomenclature Générale des Actes Professionnels / Nomenclature des Actes de Biologie Médicale, in force since 2006 (Arrêté n°177-06). | [OFF] cnss.ma/fr/content/ngap-nabm; sante.gov.ma |
| **Lettre clé** | Letter coding the kind of act (C, Cs, K, B, D...). Its monetary value comes from the TNR grid. | [OFF] anam.ma grilleannexe1.pdf |
| **Coefficient** | Multiplier attached to an act in the nomenclature (e.g. K 50). Act value = coefficient × letter value. | [OFF] same |
| **Ticket modérateur** | Part of the reimbursement basis left to the insured (basis − AMO reimbursement). | [OFF] acaps.ma (complementary formulas) |
| **Dépassement** | Billed amount above the TNR basis. Never reimbursed by the AMO; possibly by a complementary contract. | [OFF] anam.ma/cnops.org.ma excerpts: reimbursement is computed on the TNR, not on the billed amount |
| **ALD / ALC** | Affection de Longue Durée / Affection Longue et Coûteuse. They give an exoneration (total or partial) of the ticket modérateur. | [OFF] cnss.ma |
| **Remboursement** | The insured pays the provider, then files the feuille de soins to be reimbursed. Default mode for cabinet consultations. | [OFF] cnss.ma |
| **Tiers payant** | The organism pays the provider directly; the patient pays only their share. | [OFF] cnss.ma, cnops.org.ma |
| **Prise en charge (PEC)** | Prior commitment by the organism to pay (hospitalisation, day hospital...), requested by the establishment. | [OFF] cnss.ma |
| **Accord / entente préalable** | Prior approval needed for some acts (multi-session care, care abroad...). Law 65-00 art. 13. | [OFF] cnss.ma; law 65-00 |
| **Couverture complémentaire** | Optional contract (mutuelle, insurer) regulated by **ACAPS**. Covers some or all of what the AMO leaves. | [OFF] acaps.ma |
| **INPE** | Identifiant National des Professionnels et Établissements de santé, 9 digits, assigned by ANAM. | [OFF] anam.ma Guide-INPE-2020.pdf |

---

## B. Current organizations and schemes

### B.1 Organizations (who pays)

| Code (proposed) | Organization | Role | Source |
|---|---|---|---|
| `ANAM` | Agence Nationale de l'Assurance Maladie | Regulator. **Not** a payer. | [OFF] |
| `CNSS` | Caisse Nationale de Sécurité Sociale | AMO manager for the private sector and the schemes below | [OFF] cnss.ma |
| `CNOPS` | Caisse Nationale des Organismes de Prévoyance Sociale | AMO manager for the public sector **until the transfer under law 54.23** | [OFF] cnops.org.ma; [PRESS] transfer |
| mutuelles and insurers | e.g. public-sector mutuelles, private insurers | Complementary coverage (ACAPS-regulated) | [OFF] acaps.ma |
| other bodies | e.g. FAR, other specific schemes | [TBV]: whether they are AMO managers, and which rules apply | [TBV] |

### B.2 Schemes (what rights apply)

| Code (proposed) | Scheme | Manager (as of 2026-09) | Notes | Source |
|---|---|---|---|---|
| `AMO_SALARIES` | Private-sector employees and pensioners | CNSS | | [OFF] cnss.ma |
| `AMO_TNS` | Travailleurs non salariés (self-employed) | CNSS | Rights open after a contribution period (3 months per the CNSS excerpt) | [OFF] cnss.ma |
| `AMO_TADAMON` | Ex-RAMED, people unable to pay contributions | CNSS | Eligibility based on an RSU score | [OFF] cnss.ma |
| `AMO_ACHAMIL` | People able to pay but not covered by another scheme | CNSS | Since January 2024 | [OFF] cnss.ma |
| `AMO_SECTEUR_PUBLIC` | Civil servants, public agents, pensioners | CNOPS → CNSS | Law 54.23: transfer **scheduled for 2027-02-01** | [PRESS] Médias24 2026-02-03, Le Matin; BO n°7478 (2026-01-29) [TBV on sgg.gov.ma] |
| others | domestic workers, CPU contributors... | CNSS | Whether their rules differ is [TBV] | [OFF] cnss.ma |

**Design consequence.** The rules are keyed on the **scheme**, and optionally on the managing
organization *at the date of care*. The public-sector transfer shows that manager and scheme change
independently. Claims already filed with CNOPS before the switch stay CNOPS claims (see §L).

### B.3 Mapping to the current model

`insurance_organizations.organization_type` already distinguishes `AMO_MANAGER`, `MUTUELLE`,
`PRIVATE_INSURER` and `OTHER`. `patient_coverages` stores `coverage_type`
(AMO / COMPLEMENTARY / PRIVATE_INSURANCE / NONE), `organization_id`, `membership_number`,
`beneficiary_type` and validity dates. **It does not store the scheme**, which Stage 4B needs (§K.1).

---

## C. Medical act / nomenclature structure

### C.1 Current nomenclatures

| Nomenclature | Scope | Status | Source |
|---|---|---|---|
| **NGAP** | Clinical acts: consultations, visits, technical acts (K, Kc...), dental acts (D)... | In force since 2006 | [OFF] cnss.ma/fr/content/ngap-nabm; Arrêté n°177-06 (sante.gov.ma) |
| **NABM** | Biology (B) | In force since 2006 | [OFF] same |
| **CCAM (Moroccan)** | Coded classification that will replace the NGAP | Being prepared by the Commission Nationale de Nomenclature. Publication and effective date are **unknown**. | [PRESS] EcoActu; [TBV] |
| Medicines | Public sale price (PPV) / reference price, list of reimbursable medicines | Out of scope for a cabinet in Stage 4B | [TBV] |

### C.2 Structure of an NGAP act

```
act_code        : nomenclature code (e.g. chapter/article reference or a free code)
label           : "Consultation au cabinet par le médecin spécialiste"
lettre_cle      : 'Cs' | 'C' | 'K' | 'Kc' | 'B' | 'D' | ...  (key letter)
coefficient     : numeric (e.g. 1 for a consultation, 50 for K 50)
modifiers       : night/Sunday/emergency surcharges, etc. [TBV: list and values]
requires_prior_approval : bool (accord préalable)
```

**Value of an act under the TNR = coefficient × value of the key letter**, where the letter's value
comes from the TNR grid in force for that **provider category** (GP / specialist / establishment),
on that **date**. Some acts have a flat TNR instead of letter × coefficient ([TBV]: dental
prostheses, some forfaits).

Source example of the grid's *shape* only, **not to be seeded**. ANAM "Grille n°1 — Tarifs des
lettres clés", annexed to the 2006 CNOM / organismes gestionnaires convention (anam.ma, 2006): C, Cs,
K/Kc, B and D each have a unit value in DH. These values were revised by the 2020 CNSS conventions
and are under renegotiation in 2026 (§D).

### C.3 Consequence for the rules engine

The engine must support **two pricing modes** per tariff item:
1. `LETTER_COEFFICIENT`: reference = coefficient × letter value(category, date)
2. `FLAT`: reference = a fixed amount(category, date)

The nomenclature itself (codes, letters, coefficients) and the tariff values (letter values, flat
amounts) are **separate versioned datasets**: the nomenclature changes with ministerial orders, the
values with conventions.

---

## D. TNR structure

What the texts show [OFF/PRESS]:

- The TNR is fixed by **national conventions** between the AMO managers and provider
  representatives, under ANAM (anam.ma/anam/regulation/tarification-nationale-de-reference/).
- On **2020-01-13** the CNSS signed three conventions (private clinics, private specialists, private
  GPs). They are valid 4 years, raise the consultation TNR, and the TNR takes effect **60 days after
  publication** in the BO [PRESS: LeBrief, Médias24 2020-01-14].
- A new agreement in principle to revise the TNR was reported on **2026-06-18** [PRESS: Médias24].
  A new convention still has to be signed and published.
- CNOPS historically applied its own TNR / conventions. How they converge with CNSS after law 54.23
  is [TBV].

The data a TNR needs to store:

| Field | Why |
|---|---|
| `convention_id` | Which convention sets the value (legal source) |
| `organization_id` / `scheme_code` | Values can differ by manager or scheme (CNSS vs CNOPS historically) |
| `provider_category` | GP / specialist / clinic / lab / dentist... |
| `nomenclature` + `act_code` **or** `lettre_cle` | What is priced |
| `pricing_mode` | `LETTER_COEFFICIENT` or `FLAT` |
| `unit_value` / `flat_amount` | Value in MAD |
| `effective_from`, `effective_until` | Date range, applied to the **date of care** |
| `source_reference`, `source_date`, `source_url` | e.g. "Convention nationale CNSS–médecins spécialistes du secteur privé, BO n°…, applicable J+60" |

**Rule: the TNR applied is the one in force on the date of the act, not the date of filing.**
[TBV: confirm in the convention text. This is the usual rule, but not read in the source.]

---

## E. Reimbursement structure

### E.1 General formula (per act line)

```
reference_amount     = TNR(act, provider_category, scheme/org, date_of_care)
reimbursement_basis  = min(billed_amount, reference_amount)          -- [OFF] basis is the TNR, not the billed amount
rate                 = rate(scheme, act_category, situation, date)   -- situation: standard / ALD / ALC / hospital...
organism_amount      = round(reimbursement_basis × rate, 2)          -- then caps/forfaits if any
ticket_moderateur    = reimbursement_basis − organism_amount
depassement          = billed_amount − reimbursement_basis           -- ≥ 0
patient_amount       = ticket_moderateur + depassement               -- before complementary
```

Rounding rule (per line or per total, how many decimals) is [TBV]. It must be a rule parameter, not
code.

### E.2 Rates seen in official excerpts (source examples, not seed data)

| Situation | Figure seen | Source | Status |
|---|---|---|---|
| CNSS, ambulatory care | 70% of the TNR | [OFF] cnss.ma "Quel est le taux de remboursement de l'AMO" | Excerpt only |
| CNSS, ALD / ALC | ALC: 100%; ALD: 77% to 97% depending on the case; at least 90% in public establishments | [OFF] cnss.ma | Excerpt only; per-disease details [TBV] |
| CNOPS, consultations | 80% of the TNR | [OFF] decree 2-05-736, art. 1 (excerpt) | Excerpt only |
| List of ALD/ALC | 161 illnesses with ticket-modérateur exoneration | [OFF] cnss.ma | List not read |

**These figures must not be hard-coded.** They go into `insurance_rules` rows (§K), each with its
source, and are loaded only after the primary text has been read (§O).

### E.3 Things the engine must be able to express

1. A **rate** per (scheme, act category, situation), versioned.
2. **Exonerations**: ALD/ALC turns the rate into 100% or another value, only for acts linked to that
   condition. The engine needs an ALD flag on the claim line, set by the user, never guessed.
3. **Caps / forfaits** (per act, per period, per year) [TBV whether any apply to cabinet acts].
4. **Non-reimbursable acts**: act outside the panier de soins → rate 0. This is explicit data, not a
   missing rule. A missing rule means "cannot calculate", **never 0**.
5. **Waiting periods / rights opening** (e.g. AMO TNS contribution period): this is an
   **eligibility** question, not a rate. The app records coverage information only (§F.4).

### E.4 Over-billing

[OFF] ANAM/CNOPS excerpts: the reimbursement is computed on the TNR (or the ministerial price), not
on the billed amount. Under a convention, a provider working in tiers payant may not ask the insured
for more than the insured's share. Whether a cabinet in tiers payant can bill a dépassement at all is
[TBV]. The engine must at least **warn** when a tiers-payant line has `billed_amount > reference_amount`.

---

## F. Tiers payant workflow

### F.1 What the texts show

- For **private cabinet consultations**, the normal mode is **remboursement**: the patient pays, then
  files the feuille de soins [OFF cnss.ma]. **No official evidence was found of a general tiers
  payant for cabinet consultations.**
- Tiers payant exists for: hospitalisation and day hospital via prise en charge [OFF cnss.ma];
  costly medicines at the pharmacy [OFF cnss.ma]; conventioned structures (CNOPS page "Intégrer le
  mode tiers payant", wtemps.cnops.org.ma) [OFF, content not read].
- Complementary insurers can offer direct payment (tiers payant) under their own contracts [OFF
  acaps.ma].

### F.2 Consequence for Macro Medica

The app already supports tiers payant **as a bookkeeping mode**: an organism owes part of an invoice
(Stages 1–3.5). Stage 4B must **not** assume every AMO claim is tiers payant. The claim needs a
**mode**:

| `claim_mode` | Meaning | Effect on invoice |
|---|---|---|
| `TIERS_PAYANT` (existing `claim_type`) | Organism pays the cabinet | `organism_amount` is a receivable of the cabinet (existing model) |
| `REMBOURSEMENT_PATIENT` (future) | Patient pays everything; the cabinet only fills in the feuille de soins | No receivable. Invoice fully due by the patient. The calculation is **informational** ("estimated reimbursement for the patient"). |

`insurance_claims.claim_type` is currently checked to `'TIERS_PAYANT'` only. Adding
`REMBOURSEMENT_PATIENT` later is an additive change. An informational estimate must **not** create a
claim that feeds `third_party_amount`. Stage 4B should put it in a separate calculation table, or in
a claim with a mode that the allocation ignores.

### F.3 Lifecycle (already implemented, unchanged)

`DRAFT → READY → SUBMITTED → PROCESSING → PARTIALLY_SETTLED / SETTLED / REJECTED`, plus `CANCELLED`.
The settlement and rejection ledgers stay the source of truth for amounts received and refused.

### F.4 Eligibility

There is no public real-time eligibility API that this project can rely on [TBV: CNSS provider
portal]. The UI must show **"Informations de couverture enregistrées"** (the coverage as entered,
with its validity dates) and never a status such as "droits ouverts / vérifiés".

---

## G. Prise en charge workflow

From [OFF] cnss.ma excerpts:

1. **Scope**: hospitalisation, day hospital (and, per the CNOPS pages, some costly care). Not
   ordinary cabinet consultations.
2. **Who asks**: the **establishment / provider** sends the demande de prise en charge to the
   organism (CNSS portal or fax).
3. **Checks**: the organism checks administrative rights (and medical justification when needed).
4. **Answer**: within **48 business hours** (CNSS excerpt), by portal or fax: accord (possibly with
   an amount), request for information, or refusal.
5. **Billing**: after care, the establishment bills the organism within the accord; the patient
   pays the ticket modérateur and any non-covered items.

**Accord / entente préalable** (law 65-00 art. 13) is required for some acts: multi-session care
such as kinésithérapie and orthophonie, care abroad, and others listed by the conventions [TBV:
complete list]. Filed on the ANAM standardized "demande d'accord préalable" form, with the INPE.

Future data (Stage 4B+, **not** needed for the first rules engine):

```
insurance_prior_approvals
  id, clinic_id, patient_id, coverage_id, organization_id, scheme_code,
  kind ('PRISE_EN_CHARGE' | 'ACCORD_PREALABLE'),
  requested_at, reference_number, status ('REQUESTED','GRANTED','PARTIAL','REFUSED','EXPIRED'),
  granted_amount, granted_sessions, valid_from, valid_until, decision_at, notes
```

A claim line can then reference `prior_approval_id`. The rules engine checks that an act flagged
`requires_prior_approval` has a granted one, and warns otherwise. It never blocks silently.

---

## H. Complementary coverage workflow

From [OFF] acaps.ma excerpts:

- It is optional and contractual, sold by insurers or mutuelles (ACAPS-regulated).
- It covers part or all of what the AMO leaves, either by **direct payment** (documents sent before
  hospitalisation) or by **reimbursement** on proof of expenses (AMO reimbursement statement +
  invoices).
- Typical contract formulas:
  - **basic**: the ticket modérateur (TNR basis − AMO reimbursement);
  - **intermediate**: plus fee overages up to a percentage of the TNR;
  - **extended**: actual expenses, possibly with ceilings.
- Tariffs, ceilings and exclusions are **per contract**. There is no national table.
- **No evidence** that a complementary insurer automatically pays an amount the AMO rejected.

### Calculation (layered, always after AMO)

```
amo_line          = AMO calculation (§E) or AMO actually paid, per contract wording
complementary_base = depends on the formula:
    TICKET_MODERATEUR  → reimbursement_basis − amo_organism_amount
    PCT_OF_TNR         → min(billed, reference × pct) − amo_organism_amount
    FRAIS_REELS        → billed − amo_organism_amount
complementary_amount = min(complementary_base, per-act/annual ceilings) × contract_rate
patient_final        = billed − amo_organism_amount − complementary_amount
```

Because complementary rules are per contract, Stage 4B should support them as **contract-level
rules** attached to the patient's complementary coverage (or to an organization + product code).
**Manual entry stays the default for complementary claims.** The engine only proposes an amount
when a contract rule exists.

The existing model already supports this layering: one claim per organization per invoice (AMO + a
complementary), and the database refuses a total above the invoice.

---

## I. Required documents

| Document | Content required | Source |
|---|---|---|
| **Feuille de soins maladie** (ANAM standardized; CNOPS refs 610.1.02 / 610.1.03 / 610.1.04 seen) | Insured and patient identity, affiliation/immatriculation number, date of each act, act codes (lettre clé + coefficient), amounts, practitioner name, **INPE** (with barcode), **IF** (identifiant fiscal), **ICE**, doctor's signature and stamp | [OFF] cnss.ma "Modalités pour bénéficier d'un remboursement", "Complétude des dossiers"; ANAM Feuille-de-soins-Maladie-CNSS.doc |
| Supporting documents | Prescriptions (ordonnances), invoices, lab/imaging results, as applicable | [OFF] cnss.ma |
| **Demande d'accord préalable** | Standardized ANAM form with INPE | [OFF] anam.ma |
| **Demande de prise en charge** | Establishment's request (portal/fax) | [OFF] cnss.ma; exact fields [TBV] |
| Complementary claim | AMO reimbursement statement (bordereau/décompte) + invoices | [OFF] acaps.ma |

Deadlines seen:

- Filing: **60 days** from the date of care [OFF cnss.ma].
- Maximum reimbursement delay: **60 days** (law 55-19 on the simplification of administrative
  procedures) [OFF excerpt]. [TBV: exact article and to whom it applies.]

These deadlines are **rules too** (versioned, per scheme). Stage 4B+ can use them for alerts such as
"dossier à déposer avant le …". They are not needed for the amount calculation.

Data the app would need to print or export a feuille de soins (Stage 4C, not 4B): the
practitioner's INPE, IF and ICE on the practitioner/cabinet profile; the patient's immatriculation
number (`patient_coverages.membership_number`); the insured vs ayant-droit identity; and the act
codes on lines.

---

## J. INPE requirements

From [OFF] ANAM Guide-INPE-2020.pdf, anam.ma news pages, cnss.ma "Identifiant National du Praticien":

- **9-digit** identifier assigned by ANAM to every health professional **and** establishment, public
  and private.
- Specific to each **activity profile**: a doctor practising in two settings can hold several INPE
  [OFF, wording "propre à chaque profil d'activité"; exact cases TBV].
- The INPE **and its barcode** are mandatory on every AMO standardized document (feuille de soins,
  demande d'accord préalable).
- Obtained from ANAM via inpe.anam.ma or inpe@anam.ma (answer within 48 hours per the excerpt).

Model consequences:

- Store the INPE per **practitioner × practice location/activity**, not only per user:
  `practitioner_identifiers (clinic_id, profile_id, kind 'INPE'|'IF'|'ICE', value, valid_from,
  valid_until)`, or columns on the profile to start with.
- Validation: `^[0-9]{9}$`. **No checksum is known** [TBV], so don't invent one.
- Snapshot the INPE onto the claim at filing, like the other claim snapshots: a later change of INPE
  must not rewrite filed claims.
- The rules engine does **not** need the INPE to calculate. The *filing* step does. So a missing
  INPE blocks "Déposer", not the calculation.

---

## K. Recommended future database schema (Stage 4B)

Everything below is additive. It respects the Stage 3.5 invariants:

- `insurance_claims.amount_claimed` stays the claim's total;
- `third_party_amount` stays derived by `mm_sync_invoice_third_party`;
- the settlement and rejection ledgers are unchanged;
- `invoice_financials` is unchanged.

### K.1 Scheme separated from the managing organization

```sql
-- reference data, global (not per clinic): legal schemes
create table coverage_schemes (
  code text primary key,                 -- 'AMO_SALARIES','AMO_TNS','AMO_TADAMON','AMO_ACHAMIL','AMO_SECTEUR_PUBLIC',...
  label text not null,
  kind text not null check (kind in ('AMO','COMPLEMENTARY','PRIVATE')),
  source_reference text not null, source_date date, source_url text,
  is_active boolean not null default true
);

-- who manages which scheme, over time (law 54.23 = a new row, not an update)
create table scheme_managers (
  scheme_code text references coverage_schemes(code),
  organization_code text not null,        -- 'CNSS','CNOPS' (global code, see below)
  effective_from date not null,
  effective_until date,
  source_reference text not null, source_date date, source_url text,
  primary key (scheme_code, effective_from)
);
```

- `insurance_organizations` stays per clinic (the cabinet's directory). Add a nullable
  `reference_code` ('CNSS', 'CNOPS', ...) that links a clinic's organization to the global reference
  data. Rules match on `reference_code`, **never on the free-text name**.
- `patient_coverages` gets a nullable `scheme_code`. Nullable means existing rows stay valid; with
  no scheme, no rule can apply and entry stays manual.

### K.2 Nomenclature and tariffs (global, versioned)

```sql
create table nomenclature_acts (
  id uuid primary key,
  nomenclature text not null,             -- 'NGAP','NABM','CCAM'
  act_code text not null,
  label text not null,
  lettre_cle text,                        -- null for CCAM/flat acts
  coefficient numeric(10,3),
  act_category text not null,             -- 'CONSULTATION','ACTE_TECHNIQUE','BIOLOGIE','DENTAIRE',... (drives rates)
  requires_prior_approval boolean not null default false,
  effective_from date not null, effective_until date,
  source_reference text not null, source_date date, source_url text,
  unique (nomenclature, act_code, effective_from)
);

create table tariff_items (               -- the TNR
  id uuid primary key,
  convention_reference text not null,     -- legal text
  organization_code text,                 -- null = all AMO managers
  scheme_code text,                       -- null = all schemes of that manager
  provider_category text not null,        -- 'MEDECIN_GENERALISTE','MEDECIN_SPECIALISTE','CLINIQUE',...
  nomenclature text not null,
  lettre_cle text,                        -- LETTER_COEFFICIENT mode
  act_code text,                          -- FLAT mode
  pricing_mode text not null check (pricing_mode in ('LETTER_COEFFICIENT','FLAT')),
  unit_value numeric(12,2),
  flat_amount numeric(12,2),
  effective_from date not null, effective_until date,
  source_reference text not null, source_date date not null, source_url text,
  check ((pricing_mode = 'LETTER_COEFFICIENT') = (lettre_cle is not null and unit_value is not null)),
  check ((pricing_mode = 'FLAT') = (act_code is not null and flat_amount is not null))
);
```

The clinic's `actes_catalogue` gets a nullable link to the nomenclature (`nomenclature`, `act_code`,
or `nomenclature_act_id`). The cabinet's own price (`prix`) stays the **billed amount** and is never
overwritten by the TNR.

### K.3 Versioned `insurance_rules`

```sql
create table insurance_rules (
  id uuid primary key,
  rule_type text not null check (rule_type in (
    'RATE',               -- reimbursement rate on the basis
    'EXONERATION',        -- ALD/ALC override of the rate
    'CAP',                -- per act / period ceiling
    'NOT_COVERED',        -- explicit exclusion (rate 0)
    'PRIOR_APPROVAL',     -- act needs an accord
    'FILING_DEADLINE',    -- days to file
    'ROUNDING'            -- rounding mode
  )),
  -- scope: null = wildcard; the most specific match wins, then the latest effective_from
  organization_code text,
  scheme_code text,
  provider_category text,
  act_category text,
  nomenclature text,
  act_code text,
  situation text,                         -- 'STANDARD','ALD','ALC','HOSPITALISATION',...
  -- parameters, by rule_type (typed columns, not free JSON, for the core ones)
  rate numeric(6,4),                      -- 0..1
  cap_amount numeric(12,2), cap_period text,
  deadline_days integer,
  rounding text,
  params jsonb not null default '{}',     -- rare extras only
  effective_from date not null,
  effective_until date,
  source_reference text not null,         -- e.g. 'Décret n° 2-05-736, art. 1'
  source_date date not null,              -- date of the text (BO date)
  source_url text,
  validated_by uuid, validated_at timestamptz,  -- a rule is used only once validated
  superseded_by uuid references insurance_rules(id),
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from),
  check (rate is null or (rate >= 0 and rate <= 1))
);
```

- Overlapping rules with the same scope and type are forbidden, via an exclusion constraint on
  (scope, daterange). Ties never exist, so the choice is deterministic.
- Complementary contracts: same table, with `organization_code` / a `contract_code` scope column,
  plus clinic scoping (`clinic_id` nullable: null = national rule, non-null = clinic-entered contract
  rule).

### K.4 `insurance_claim_lines` (act-level calculation)

```sql
create table insurance_claim_lines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  claim_id uuid not null,                 -- fk (claim_id, clinic_id) → insurance_claims
  line_no integer not null,
  source_line_id uuid,                    -- the invoice line (see K.6), when there is one
  act_date date not null,                 -- date of care: picks the TNR/rule versions
  nomenclature text, act_code text, lettre_cle text, coefficient numeric(10,3),
  label text not null,                    -- snapshot
  quantity integer not null default 1 check (quantity > 0),
  situation text not null default 'STANDARD',   -- ALD/ALC set by the user, never inferred
  prior_approval_id uuid,
  -- the amounts (§ summary), all snapshots
  billed_amount numeric(12,2) not null check (billed_amount >= 0),   -- line total (unit price × quantity)
  reference_amount numeric(12,2),         -- null = no TNR found
  reimbursement_basis numeric(12,2),
  rate numeric(6,4),
  organism_amount numeric(12,2) not null check (organism_amount >= 0),
  patient_amount numeric(12,2) not null check (patient_amount >= 0),
  calculation_mode text not null check (calculation_mode in ('MANUAL','COMPUTED','COMPUTED_OVERRIDDEN')),
  calculation_id uuid,                    -- → insurance_calculations (K.5)
  override_reason text,                   -- required when COMPUTED_OVERRIDDEN
  unique (claim_id, line_no),
  check (organism_amount + patient_amount = billed_amount),  -- patient_amount is before any complementary claim
  check (organism_amount <= billed_amount)
);
```

**Compatibility rule with the current model.** When a claim has lines, `amount_claimed = Σ
organism_amount`, enforced by the same kind of guarded sync trigger as `third_party_amount`
(Stage 3.5 style: only the sync function writes it). A claim **without** lines keeps today's
manual `amount_claimed`. So old claims stay valid, and a clinic can keep manual entry.

Lines are editable only while the claim is `DRAFT` or `READY`. After `SUBMITTED` they are frozen,
like the other claim snapshots. A correction goes through rejection/refile, which already exists.

### K.5 Calculation snapshot

```sql
create table insurance_calculations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  claim_id uuid,                          -- null for an informational estimate (remboursement mode)
  invoice_id uuid not null,
  computed_at timestamptz not null default now(),
  computed_by uuid,
  engine_version text not null,           -- code version of the engine
  inputs jsonb not null,                  -- coverage, scheme, org code, provider category, lines, dates, situation
  rules_applied jsonb not null,           -- [{line_no, tariff_item_id, rule_ids[], source_reference, effective_from}]
  result jsonb not null,                  -- per line + totals: reference, basis, rate, organism, patient
  warnings jsonb not null default '[]',   -- e.g. 'NO_TNR', 'DEPASSEMENT_EN_TIERS_PAYANT', 'PRIOR_APPROVAL_MISSING'
  status text not null check (status in ('COMPLETE','PARTIAL','FAILED'))
);
```

- **Immutable** (insert only). A recalculation creates a new row.
- The snapshot copies the **values** used (TNR value, rate, source reference), not only their ids.
  An audit then does not depend on the reference tables staying unchanged.
- `PARTIAL` or `FAILED`: at least one line has no applicable TNR or rule. The UI shows the missing
  pieces and falls back to **manual entry** for those lines. **Never assume 0% or 100%.**

### K.6 Invoice lines: gap found in the current code (not an incompatibility)

Itemised lines live in `facture_lignes`, keyed by **`consultation_id`**, not by the invoice
(`payments.id`). Tiers-payant invoices must be linked to a **visit** (`visit_id`), and the visit
flow may produce invoices **with no itemised lines**. Stage 4B therefore needs one of these:

1. an invoice-level line table (or `facture_lignes.invoice_id`, filled for visit invoices), so claim
   lines can point at real billed lines; **or**
2. claim lines entered directly on the claim (`source_line_id` null), with `billed_amount` typed from
   the invoice.

Recommendation: start with (2); it does not touch invoicing. Add (1) when itemised visit billing
exists. Either way: **Σ claim line billed_amount ≤ invoice amount** is checked by the database.

### K.7 Where the calculation plugs into the existing flow

```
CreateClaimModal
  ├─ (today) user types "Part organisme"                              → create_claim(amount)
  └─ (4B)   user lists acts (or picks invoice lines), sets situation
            → rpc calculate_claim(invoice, coverage, lines)            → insurance_calculations row
            → shows per line: facturé / TNR / base / taux / part organisme / part patient,
              + source ("Convention …, en vigueur depuis …") + warnings
            → user accepts or overrides (reason required)              → create_claim_with_lines(...)
                                                                        → Σ lines = amount_claimed
                                                                        → mm_sync_invoice_third_party (unchanged)
```

The existing `insurance_claims.invoice_amount / patient_share` split check
(`amount_claimed + patient_share = invoice_amount`) keeps working, because `amount_claimed` is still
a single total.

### K.8 Compatibility check with the Stage 3.5 financial model

| Invariant | Impact of the schema above |
|---|---|
| `amount_paid` = patient money only | None |
| `third_party_amount` derived only by `mm_sync_invoice_third_party` | None: it still reads `amount_claimed` and the rejections |
| Settlements and rejections are ledgers; cached sums are not writable | None: they still apply to the claim total. Line-level rejection is optional later (a rejection row could get a nullable `claim_line_id`). |
| One original claim per (invoice, organization); one refile per rejection | None |
| `invoice_financials` view | None. Optional later: expose Σ reference / Σ dépassement. |
| `claim_type in ('TIERS_PAYANT')` | Additive: a `REMBOURSEMENT_PATIENT` estimate must not feed the allocation (§F.2) |

**Result: no incompatibility found. No change to the existing financial model is needed in Stage 4A.**

---

## L. Versioning strategy

1. **Everything legal is dated.** `nomenclature_acts`, `tariff_items`, `insurance_rules` and
   `scheme_managers` carry `effective_from` / `effective_until`. They are never updated in place
   once validated: a new text means new rows plus `effective_until` (and `superseded_by`) on the old
   ones.
2. **Selection date = date of care** (`act_date` on the line), not the filing or calculation date
   ([TBV] in the conventions; make it a single, documented choice in the engine).
3. **Manager at the date of care**: resolved through `scheme_managers`. A public-sector act dated
   2027-01-31 goes to CNOPS, one dated 2027-02-01 to CNSS, if the BO confirms that date. The
   transition rules for in-flight claims are [TBV] (§O).
4. **Snapshots freeze history.** A claim line copies its amounts, and `insurance_calculations` copies
   the values and sources used. A later rule change never rewrites a filed claim.
5. **Validation gate.** A rule is used by the engine only when `validated_at` is set (a human checked
   it against the source). Unvalidated rows are invisible to the engine, so imported drafts can't
   leak into bills.
6. **Publication lag.** A convention can take effect "60 days after BO publication". Store the real
   effective date, computed when the rule is entered, not the signature date.
7. **Engine version.** `engine_version` in each snapshot, so a change to the formula (e.g. rounding)
   is traceable.
8. **Reference data scope.** National data (schemes, nomenclature, TNR, AMO rules) is global and
   maintained centrally, read-only for clinics. Contract data (complementary rules) is per clinic.

---

## M. Configurable parts (data, never code)

| Configurable | Level | Notes |
|---|---|---|
| Schemes and their managers over time | National | law 54.23 transition |
| Nomenclature acts (code, letter, coefficient, category, prior approval flag) | National | NGAP/NABM now, CCAM later |
| Key-letter values and flat tariffs (TNR) per provider category, manager or scheme | National | per convention |
| Reimbursement rates per scheme × act category × situation | National | 70% / 80% etc. are **data** |
| ALD/ALC exonerations | National | per scheme |
| Caps, forfaits, exclusions | National | |
| Filing deadlines, reimbursement deadlines | National | 60 days etc. |
| Rounding | National | |
| Complementary contract formulas, rates, ceilings | Clinic / contract | ticket modérateur, % TNR, frais réels |
| Practitioner provider category (GP / specialist...) | Clinic / practitioner | drives the TNR grid; today `profiles.specialite` is free text |
| Practitioner INPE / IF / ICE | Clinic / practitioner | for filing, not for the calculation |
| Cabinet act ↔ nomenclature mapping | Clinic | `actes_catalogue` link |
| Whether a clinic uses the engine or manual entry | Clinic | default: **manual** |

**Not configurable** (code): the formula order in §E.1 and §H, the invariants, snapshotting, the
"missing rule ⇒ cannot calculate" behaviour, and the validation gate.

---

## N. Official sources and dates

All accessed 2026-09-27 via search-engine excerpts (full text blocked, see §0).

| # | Source | Domain | Date of text | Used for |
|---|---|---|---|---|
| 1 | Law 65-00, Code de la couverture médicale de base (art. 7 panier de soins, art. 13 accord préalable) | sgg.gov.ma / anam.ma | 2002 (in force 2005) | A, G |
| 2 | Law 54.23 amending law 65-00 (CNOPS → CNSS transfer, children up to 30) | BO n°7478 | 2026-01-29 (per press) | B, L |
| 3 | Médias24, "AMO secteur public : transfert…" | medias24.com [PRESS] | 2026-02-03 | B (dates) |
| 4 | ANAM, "Tarification nationale de référence" | anam.ma/anam/regulation/tarification-nationale-de-reference/ | n/a | D |
| 5 | ANAM, Grille n°1 Tarifs des lettres clés (annexe convention 2006) | anam.ma/anam/wp-content/uploads/2021/09/grilleannexe1.pdf | 2006 | C (structure only) |
| 6 | CNSS, "NGAP / NABM" | cnss.ma/fr/content/ngap-nabm | n/a | C |
| 7 | Ministère de la Santé, Arrêté n°177-06 (NGAP) | sante.gov.ma | 2006 | C |
| 8 | CNSS, "Conventions nationales" | cnss.ma/fr/content/conventions-nationales | n/a | D |
| 9 | LeBrief / Médias24, CNSS conventions of 2020-01-13 | [PRESS] | 2020-01-14 | D |
| 10 | Médias24, TNR revision agreement in principle | [PRESS] | 2026-06-18 | D |
| 11 | EcoActu, CCAM in preparation | [PRESS] | n/a | C |
| 12 | CNSS, "Quel est le taux de remboursement de l'AMO" | cnss.ma | n/a | E |
| 13 | Decree n° 2-05-736 (CNOPS rates), art. 1 | sgg.gov.ma / cnops.org.ma | 2005 | E |
| 14 | CNSS, "Modalités pour bénéficier d'un remboursement"; "Complétude des dossiers" | cnss.ma | n/a | F, I |
| 15 | ANAM, Feuille de soins maladie (CNSS model) | anam.ma (Feuille-de-soins-Maladie-CNSS.doc) | n/a | I |
| 16 | CNSS, prise en charge / tiers payant pages | cnss.ma | n/a | F, G |
| 17 | CNOPS, "Intégrer le mode tiers payant" | wtemps.cnops.org.ma/beneficiertiersp?r=261 | n/a | F |
| 18 | ACAPS, couverture médicale complémentaire / assurance maladie | acaps.ma | n/a | H |
| 19 | ANAM, Guide INPE 2020 | anam.ma (Guide-INPE-2020.pdf) | 2020 | J |
| 20 | CNSS, "Identifiant National du Praticien (INP)" | cnss.ma | n/a | J |
| 21 | Law 55-19 (simplification of administrative procedures): 60-day delay | sgg.gov.ma | 2020 | I |
| 22 | CNSS scheme pages (AMO TNS, Tadamon, Achamil) | cnss.ma | n/a | B |

---

## O. Unresolved questions (Stage 4B must answer these before implementing)

**Primary texts to obtain** (blocked hosts, see §0):

1. The **current TNR grids** (CNSS 2020 conventions and any later amendment; CNOPS grid): letter
   values per provider category, flat tariffs, effective dates (BO publication + 60 days).
2. Whether the **2026 TNR revision** was signed and published, and its effective date.
3. **Law 54.23** from the BO (n°7478): exact effective date of the transfer and the transitional
   provisions for public-sector claims in flight.
4. Official **CNOPS and CNSS rate tables** per act category and scheme (not only "consultations").
   Do AMO TNS / Tadamon / Achamil have the same rates as AMO salariés?
5. **ALD/ALC** list and rates per disease, and how the exoneration applies (only acts linked to the
   ALD?).
6. **NGAP** full act list with coefficients and modifiers (night, Sunday, emergency), and the
   **CCAM** status.

**Business questions** (for the product owner):

7. Does any cabinet using Macro Medica actually practise **AMO tiers payant for consultations**
   (e.g. a CNOPS convention)? Otherwise the primary use of the engine is an **estimate** for the
   patient (remboursement mode), and the tiers-payant path mainly serves complementary insurers.
8. Which **provider category** is each practitioner (GP, specialist, which specialty)?
   `profiles.specialite` is free text today.
9. Should the engine calculate per line at `act_date`, or per claim at the invoice date? (Same
   answer in most cases; they differ for multi-day care.)
10. Rounding: per line or on the total? 2 decimals?
11. Complementary contracts: which formulas do the clinics' main mutuelles/insurers use? Are they
    willing to enter contract rules, or does complementary stay manual?
12. Dépassement in tiers payant: allowed, warned, or blocked?
13. Who **validates** national rules (the validation gate in §L.5): Macro Medica staff centrally, or
    each clinic?
14. Invoice lines for visit-based invoices (§K.6): keep claim-level lines, or add invoice-level
    lines first?
15. INPE per activity profile: one INPE per practitioner per clinic is enough for your users?

**Checks to make on the documents themselves:**

16. Exact current **feuille de soins** fields (ANAM model version in force), including the barcode
    format.
17. Exact **demande de prise en charge** and **accord préalable** fields and the list of acts that
    need an accord.
18. Filing deadline (60 days) and reimbursement deadline (law 55-19): the exact article, and whether
    they apply to CNOPS as well as CNSS.

Until these are answered, the application behaves as today: **organism share entered manually**,
coverage shown as **"Informations de couverture enregistrées"**, and no automatic eligibility status.
