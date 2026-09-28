import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '../../context/AppContext';

// Tiers payant: coverage -> organization -> payment mode -> claim.
//
//   insurance_organizations  the organisms the clinic works with (configured by the clinic; CNSS or
//                            CNOPS are ordinary rows, never a hard-coded kind).
//   patient_coverages        a patient's AMO / complementary / private coverage.
//   payments (the invoice)   payment_mode PATIENT | TIERS_PAYANT; third_party_amount = the share the
//                            organism pays the cabinet. amount_paid is what the PATIENT paid.
//   insurance_claims         the cabinet's receivable on the organism for a tiers-payant invoice.
//   insurance_settlements    immutable ledger of the money each organism actually paid (never patient
//                            money). claim.amount_received is a cached sum of it.
//   insurance_claim_rejections  each amount an organism refused. It waits for its own explicit
//                            resolution (re-file, put on the patient, waive). amount_rejected = sum.
//
// An invoice can carry several claims (one per organization, plus re-filings). Its third-party
// share (payments.third_party_amount) is derived from them by the database.
//
// A patient who pays everything and gets reimbursed later is not a claim: nothing is owed to the
// cabinet.
//
//   insurance_claim_lines / insurance_calculations  a claim's per-line breakdown and the immutable
//                            record of what the rules engine answered for each line. The engine only
//                            applies VERIFIED rules; with none (today) it answers MANUAL_REQUIRED and
//                            the organism's share is entered by the user, with a reason, and shown
//                            as "Montant saisi manuellement". Nothing is estimated client-side.
// Reads are plain selects (RLS scopes them to the clinic). Every write is a SECURITY DEFINER RPC.

export type OrganizationType = 'AMO_MANAGER' | 'MUTUELLE' | 'PRIVATE_INSURER' | 'OTHER';
export type CoverageType = 'AMO' | 'COMPLEMENTARY' | 'PRIVATE_INSURANCE' | 'NONE';
export type BeneficiaryType = 'ASSURE' | 'AYANT_DROIT' | 'UNKNOWN';
export type ClaimStatus =
  | 'DRAFT' | 'READY' | 'SUBMITTED' | 'PROCESSING' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'REJECTED' | 'CANCELLED';
export type RejectionResolution = 'REFILED' | 'TRANSFERRED_TO_PATIENT' | 'WAIVED';
export type SettlementMethod = 'BANK_TRANSFER' | 'CHECK' | 'CASH' | 'OTHER';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  code: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  isActive: boolean;
}

export interface Coverage {
  id: string;
  patientId: string;
  type: CoverageType;
  organizationId: string | null;
  membershipNumber: string;
  beneficiary: BeneficiaryType;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  notes: string;
  // AMO scheme (régime), a configurable code; never deduced from the number, organization or beneficiary
  schemeCode: string | null;
}

export interface Claim {
  id: string;
  invoiceId: string;
  visitId: string | null;
  patientId: string;
  patientNom: string;
  praticienId: string;
  coverageId: string;
  organizationId: string;
  status: ClaimStatus;
  invoiceAmount: number;
  claimed: number;
  patientShare: number;
  received: number;
  rejected: number;
  // what the coverage looked like when the claim was created
  coverageType: CoverageType | null;
  organizationName: string;
  membershipNumber: string;
  beneficiary: BeneficiaryType | null;
  externalReference: string;
  notes: string;
  rejectionReason: string;
  previousClaimId: string | null;
  rejections: Rejection[];
  // where amount_claimed comes from (see AMOUNT_ORIGIN_LABEL)
  amountOrigin: AmountOrigin;
  createdAt: string;
  submittedAt: string | null;
  receivedAt: string | null;
}

export type CalculationStatus = 'CALCULATED' | 'MANUAL_REQUIRED' | 'CONFLICT';
// CALCULATED / MANUAL / MIXED: from the claim's lines. LEGACY: a claim created before claim lines
// existed (its amount was typed by hand). REFILE: a re-filing, whose amount is the rejected amount.
export type AmountOrigin = 'CALCULATED' | 'MANUAL' | 'MIXED' | 'LEGACY' | 'REFILE';

// The engine's answer for one line, as shown to the user.
export interface LineCalculation {
  status: CalculationStatus;
  reasonCode: string | null;
  reason: string | null;
  dateOfCare: string | null;
  actLabel: string | null;
  billed: number;
  tnr: number | null;
  basis: number | null;
  organism: number | null;
  patient: number | null;
  ruleKey: string | null;
  ruleVersion: number | null;
  ruleEffectiveFrom: string | null;
  sources: Array<{ title: string; issuingBody: string; publicationDate: string | null; version: string | null }>;
  engineVersion: string;
  quantity: number;
  // inputs the engine needed and did not have (SCHEME, PROVIDER_SECTOR, PROVIDER_CATEGORY, ACT)
  missingContext: string[];
}

// A reference act (insurance_act_catalog), selectable only when verified and in force.
export interface InsuranceAct {
  id: string;
  nomenclature: string;
  code: string;
  label: string;
  category: string;
}

// What the engine would use for an invoice + coverage, and what is missing.
export interface InsuranceContext {
  dateOfCare: string;
  schemeCode: string | null;
  providerSector: string | null;
  providerCategory: string | null;
  specialty: string | null;
  missing: string[];
}

export const MISSING_CONTEXT_LABEL: Record<string, string> = {
  SCHEME: 'Régime AMO non renseigné',
  PROVIDER_SECTOR: 'Secteur du cabinet non renseigné',
  PROVIDER_CATEGORY: 'Catégorie du praticien non renseignée',
  ACT: 'Acte non identifié',
};

// One line of a new claim, as sent to create_insurance_claim_with_lines.
export interface ClaimLineInput {
  actId: string | null;
  label: string;
  quantity: number;
  billed: number;
  manualAmount: number | null;   // set = "Montant saisi manuellement"
  manualReason: string | null;
}

// Claim context frozen at creation (insurance_claim_contexts).
export interface ClaimContext {
  dateOfCare: string;
  schemeCode: string | null;
  providerSector: string | null;
  providerCategory: string | null;
}

export interface ClaimLine {
  id: string;
  lineNo: number;
  label: string;
  nomenclature: string | null;
  actCode: string | null;
  quantity: number;
  dateOfCare: string;
  billed: number;
  organism: number;
  amountSource: 'CALCULATED' | 'MANUAL';
  calculationStatus: CalculationStatus;
  manualReason: string;
  enteredAt: string;
  calculation: LineCalculation | null;
}

export interface Rejection {
  id: string;
  claimId: string;
  amount: number;
  reason: string;
  rejectedAt: string;
  resolution: RejectionResolution | null;
  resolutionNote: string;
  resolvedAt: string | null;
  refiledClaimId: string | null;
}

export interface Settlement {
  id: string;
  claimId: string;
  organizationId: string;
  patientId: string;
  amount: number;
  receivedAt: string;
  method: SettlementMethod;
  reference: string;
  notes: string;
}

export const SETTLEMENT_METHODS: SettlementMethod[] = ['BANK_TRANSFER', 'CHECK', 'CASH', 'OTHER'];
export const SETTLEMENT_METHOD_LABEL: Record<SettlementMethod, string> = {
  BANK_TRANSFER: 'Virement',
  CHECK: 'Chèque',
  CASH: 'Espèces',
  OTHER: 'Autre',
};

export const RESOLUTION_LABEL: Record<RejectionResolution, string> = {
  REFILED: 'Redéposé',
  TRANSFERRED_TO_PATIENT: 'Mis à la charge du patient',
  WAIVED: 'Abandonné / exonéré',
};

export const ORGANIZATION_TYPES: OrganizationType[] = ['AMO_MANAGER', 'MUTUELLE', 'PRIVATE_INSURER', 'OTHER'];
export const ORGANIZATION_TYPE_LABEL: Record<OrganizationType, string> = {
  AMO_MANAGER: 'Organisme gestionnaire AMO',
  MUTUELLE: 'Mutuelle',
  PRIVATE_INSURER: 'Assurance privée',
  OTHER: 'Autre',
};

export const COVERAGE_TYPES: CoverageType[] = ['AMO', 'COMPLEMENTARY', 'PRIVATE_INSURANCE', 'NONE'];
export const COVERAGE_TYPE_LABEL: Record<CoverageType, string> = {
  AMO: 'AMO',
  COMPLEMENTARY: 'Complémentaire',
  PRIVATE_INSURANCE: 'Assurance privée',
  NONE: 'Aucune couverture',
};

export const BENEFICIARY_LABEL: Record<BeneficiaryType, string> = {
  ASSURE: 'Assuré',
  AYANT_DROIT: 'Ayant droit',
  UNKNOWN: 'Non précisé',
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; cls: string; dot: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200', dot: 'bg-slate-300' },
  READY: { label: 'À déposer', cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200', dot: 'bg-slate-500' },
  SUBMITTED: { label: 'Déposé', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', dot: 'bg-blue-500' },
  PROCESSING: { label: 'En cours', cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200', dot: 'bg-indigo-500' },
  PARTIALLY_SETTLED: { label: 'Réglé en partie', cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-500' },
  SETTLED: { label: 'Réglé', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  REJECTED: { label: 'Rejeté', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200', dot: 'bg-red-500' },
  CANCELLED: { label: 'Annulé', cls: 'bg-slate-50 text-slate-400 ring-1 ring-slate-200', dot: 'bg-slate-300' },
};
export const CLAIM_STATUSES = Object.keys(CLAIM_STATUS) as ClaimStatus[];

// Claims the organism still has to act on (organization balances).
export const OPEN_CLAIM_STATUSES: ClaimStatus[] = ['DRAFT', 'READY', 'SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED'];
// Filed and waiting for the organism's payment ("En attente de règlement").
export const AWAITING_SETTLEMENT_STATUSES: ClaimStatus[] = ['SUBMITTED', 'PROCESSING', 'PARTIALLY_SETTLED'];

// What the organism still owes on a claim.
export const AMOUNT_ORIGIN_LABEL: Record<AmountOrigin, string> = {
  CALCULATED: 'Montant calculé',
  MANUAL: 'Montant saisi manuellement',
  MIXED: 'Montant en partie saisi manuellement',
  LEGACY: 'Montant saisi manuellement',
  REFILE: 'Montant repris du rejet',
};

export const claimOutstanding = (c: Pick<Claim, 'claimed' | 'received' | 'rejected'>) =>
  Math.max(0, c.claimed - c.received - c.rejected);

// A refused amount that still needs an explicit decision (re-file, patient, waive).
export const unresolvedRejected = (c: Pick<Claim, 'rejections'>) =>
  c.rejections.filter(r => !r.resolution).reduce((a, r) => a + r.amount, 0);
export const waivedAmount = (c: Pick<Claim, 'rejections'>) =>
  c.rejections.filter(r => r.resolution === 'WAIVED').reduce((a, r) => a + r.amount, 0);
// What the organism is (still) responsible for on this claim: the claimed amount minus refusals
// moved to the patient or to a re-filed claim. Summed per invoice, it is the invoice's organism share.
export const claimAllocation = (c: Pick<Claim, 'status' | 'claimed' | 'rejections'>) =>
  c.status === 'CANCELLED' ? 0
    : c.claimed - c.rejections.filter(r => r.resolution === 'REFILED' || r.resolution === 'TRANSFERRED_TO_PATIENT').reduce((a, r) => a + r.amount, 0);

// Claims that can receive money from the organism.
export const canReceiveSettlement = (c: Pick<Claim, 'status'>) => AWAITING_SETTLEMENT_STATUSES.includes(c.status);

// A coverage that can back a new claim today.
export const isCoverageUsable = (c: Coverage, today = new Date().toISOString().slice(0, 10)) =>
  c.isActive && c.type !== 'NONE' && !!c.organizationId
  && (!c.validFrom || c.validFrom <= today) && (!c.validUntil || c.validUntil >= today);

const ERRORS: Array<[RegExp, string]> = [
  [/already exists for this invoice and organization/i, 'Un dossier existe déjà pour cet organisme sur cette facture.'],
  [/claims exceed what is still unpaid/i, 'Le total des dossiers dépasse le reste à payer de la facture.'],
  [/invoice is not open/i, "Cette facture n'est plus ouverte : le patient l'a déjà réglée ou elle est annulée."],
  [/not linked to a visit/i, "Cette facture n'est liée à aucune visite."],
  [/visit is cancelled/i, 'La visite de cette facture est annulée.'],
  [/coverage belongs to another patient/i, "Cette couverture appartient à un autre patient."],
  [/coverage is not active/i, "La couverture choisie n'est pas active."],
  [/coverage is not valid today/i, "La couverture choisie n'est pas valide à ce jour."],
  [/organization is inactive/i, "L'organisme de cette couverture est désactivé."],
  [/exceeds what is still unpaid/i, 'La part organisme dépasse le reste à payer de la facture.'],
  [/invalid scheme code/i, 'Code de régime invalide : lettres majuscules, chiffres et « _ » uniquement.'],
  [/invalid (sector|category) code/i, 'Code invalide : lettres majuscules, chiffres et « _ » uniquement.'],
  [/quantity must be between/i, 'La quantité doit être comprise entre 1 et 999.'],
  [/label is required/i, "Chaque ligne doit avoir un libellé."],
  [/manually entered amount needs a reason/i, 'Indiquez le motif de la saisie manuelle.'],
  [/automatic calculation unavailable/i, 'Calcul automatique indisponible : saisissez le montant et son motif.'],
  [/must be between 0 and the billed amount/i, 'La part organisme ne peut pas dépasser le montant facturé.'],
  [/lines total .* exceeds the invoice amount/i, 'Le montant facturé dépasse le total de la facture.'],
  [/amount claimed must be positive/i, 'Saisissez la part prise en charge par l’organisme.'],
  [/must be submitted before a (settlement|rejection)/i, "Le dossier doit d'abord être déposé."],
  [/rejection .* exceeds the outstanding amount/i, "Le montant refusé dépasse ce que l'organisme doit encore."],
  [/idempotency key already used/i, 'Ce règlement a déjà été enregistré.'],
  [/settlement date is in the future/i, 'La date du règlement ne peut pas être dans le futur.'],
  [/rejection already resolved/i, 'Ce rejet a déjà été traité.'],
  [/no rejected amount to resolve/i, "Ce dossier n'a pas de montant rejeté à traiter."],
  [/waiver reason is required/i, "Indiquez le motif de l'abandon."],
  [/exceeds the invoice third-party share/i, "Le montant rejeté dépasse la part organisme de la facture."],
  [/exceeds the outstanding amount/i, "Le montant dépasse ce que l'organisme doit encore."],
  [/a rejection reason is required/i, 'Indiquez le motif du rejet.'],
  [/invalid settlement amounts/i, 'Montant invalide.'],
  [/already received a settlement/i, "Ce dossier a déjà reçu un règlement de l'organisme."],
  [/invalid claim transition/i, "Cette action n'est pas possible pour ce dossier."],
  [/claim is closed/i, 'Ce dossier est clôturé.'],
  [/organization not found/i, 'Choisissez un organisme.'],
  [/organization name is required/i, "Saisissez le nom de l'organisme."],
  [/insurance_organizations_clinic_name_uniq|duplicate key/i, 'Un organisme porte déjà ce nom.'],
  [/patient_coverages_validity_check/i, 'La date de fin doit être postérieure à la date de début.'],
  [/cross-clinic|not authorized|permission/i, "Vous n'avez pas l'autorisation d'effectuer cette action."],
];
const friendly = (err: any): Error => {
  const msg = String(err?.message || '');
  const hit = ERRORS.find(([re]) => re.test(msg));
  return new Error(hit ? hit[1] : msg || 'Une erreur est survenue.');
};
const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw friendly(error);
  return data;
};

const toOrganization = (r: any): Organization => ({
  id: r.id,
  name: r.name,
  type: r.organization_type,
  code: r.code || '',
  contactName: r.contact_name || '',
  phone: r.phone || '',
  email: r.email || '',
  address: r.address || '',
  isActive: Boolean(r.is_active),
});

const toCoverage = (r: any): Coverage => ({
  id: r.id,
  patientId: r.patient_id,
  type: r.coverage_type,
  organizationId: r.organization_id,
  membershipNumber: r.membership_number || '',
  beneficiary: r.beneficiary_type,
  validFrom: r.valid_from,
  validUntil: r.valid_until,
  isActive: Boolean(r.is_active),
  notes: r.notes || '',
  schemeCode: r.scheme_code || null,
});

const fetchOrganizations = async (clinicId: string): Promise<Organization[]> => {
  const { data, error } = await supabase
    .from('insurance_organizations')
    .select('id, name, organization_type, code, contact_name, phone, email, address, is_active')
    .eq('clinic_id', clinicId)
    .order('name');
  if (error) throw error;
  return (data || []).map(toOrganization);
};

const amountOrigin = (lines: Array<{ amount_source: string }>, refile: boolean): AmountOrigin => {
  if (lines.length === 0) return refile ? 'REFILE' : 'LEGACY';
  if (lines.every(l => l.amount_source === 'CALCULATED')) return 'CALCULATED';
  if (lines.every(l => l.amount_source === 'MANUAL')) return 'MANUAL';
  return 'MIXED';
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const toLineCalculation = (r: any, dateOfCare: string | null): LineCalculation => ({
  status: r.status,
  reasonCode: r.reason_code ?? null,
  reason: r.reason ?? null,
  dateOfCare: r.date_of_care ?? dateOfCare,
  actLabel: r.act?.label ?? null,
  billed: Number(r.billed_amount),
  tnr: num(r.tnr_amount),
  basis: num(r.reimbursement_basis),
  organism: num(r.organism_amount),
  patient: num(r.patient_amount),
  ruleKey: r.rule?.rule_key ?? null,
  ruleVersion: r.rule?.version ?? null,
  ruleEffectiveFrom: r.rule?.effective_from ?? null,
  sources: (r.sources || []).map((s: any) => ({
    title: s.title, issuingBody: s.issuing_body, publicationDate: s.publication_date ?? null, version: s.version ?? null,
  })),
  engineVersion: r.engine_version,
  quantity: Number(r.quantity ?? 1),
  missingContext: r.missing_context || [],
});

const fetchClaimLines = async (claimId: string): Promise<ClaimLine[]> => {
  const { data, error } = await supabase
    .from('insurance_claim_lines')
    .select('id, line_no, label, nomenclature, act_code, quantity, date_of_care, billed_amount, organism_amount, amount_source, calculation_status, manual_reason, entered_at, insurance_calculations(result)')
    .eq('claim_id', claimId)
    .order('line_no');
  if (error) throw error;
  return (data || []).map((l: any): ClaimLine => ({
    id: l.id,
    lineNo: l.line_no,
    label: l.label,
    nomenclature: l.nomenclature,
    actCode: l.act_code,
    quantity: Number(l.quantity ?? 1),
    dateOfCare: l.date_of_care,
    billed: Number(l.billed_amount),
    organism: Number(l.organism_amount),
    amountSource: l.amount_source,
    calculationStatus: l.calculation_status,
    manualReason: l.manual_reason || '',
    enteredAt: l.entered_at,
    calculation: l.insurance_calculations?.result ? toLineCalculation(l.insurance_calculations.result, l.date_of_care) : null,
  }));
};

const fetchClaims = async (clinicId: string): Promise<Claim[]> => {
  const { data: rej, error: rejError } = await supabase
    .from('insurance_claim_rejections')
    .select('id, claim_id, amount, reason, rejected_at, resolution, resolution_note, resolved_at, refiled_claim_id')
    .eq('clinic_id', clinicId)
    .order('rejected_at');
  if (rejError) throw rejError;
  const rejectionsByClaim = new Map<string, Rejection[]>();
  (rej || []).forEach((r: any) => {
    const list = rejectionsByClaim.get(r.claim_id) || [];
    list.push({
      id: r.id, claimId: r.claim_id, amount: Number(r.amount), reason: r.reason, rejectedAt: r.rejected_at,
      resolution: r.resolution || null, resolutionNote: r.resolution_note || '', resolvedAt: r.resolved_at || null,
      refiledClaimId: r.refiled_claim_id || null,
    });
    rejectionsByClaim.set(r.claim_id, list);
  });

  const { data, error } = await supabase
    .from('insurance_claims')
    // embedded through the same-clinic (composite) foreign keys, named explicitly
    .select('*, patients:patients!insurance_claims_patient_fkey(nom, prenom), visits:visits!insurance_claims_visit_fkey(doctor_id), insurance_claim_lines(amount_source)')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data || []).map((r: any): Claim => ({
    id: r.id,
    invoiceId: r.invoice_id,
    visitId: r.visit_id,
    patientId: r.patient_id,
    patientNom: r.patients ? `${r.patients.prenom || ''} ${r.patients.nom || ''}`.trim() || 'Patient inconnu' : 'Patient inconnu',
    praticienId: r.visits?.doctor_id || '',
    coverageId: r.coverage_id,
    organizationId: r.organization_id,
    status: r.status,
    invoiceAmount: Number(r.invoice_amount),
    claimed: Number(r.amount_claimed),
    patientShare: Number(r.patient_share),
    received: Number(r.amount_received),
    rejected: Number(r.amount_rejected),
    coverageType: r.coverage_type_snapshot,
    organizationName: r.organization_name_snapshot || '',
    membershipNumber: r.membership_number_snapshot || '',
    beneficiary: r.beneficiary_type_snapshot,
    externalReference: r.external_reference || '',
    notes: r.notes || '',
    rejectionReason: r.rejection_reason || '',
    previousClaimId: r.previous_claim_id || null,
    rejections: rejectionsByClaim.get(r.id) || [],
    amountOrigin: amountOrigin(r.insurance_claim_lines || [], Boolean(r.previous_claim_id)),
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    receivedAt: r.received_at,
  }));
};

const fetchSettlements = async (clinicId: string): Promise<Settlement[]> => {
  const { data, error } = await supabase
    .from('insurance_settlements')
    .select('id, claim_id, organization_id, patient_id, amount, received_at, payment_method, reference, notes')
    .eq('clinic_id', clinicId)
    .order('received_at', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data || []).map((r: any): Settlement => ({
    id: r.id,
    claimId: r.claim_id,
    organizationId: r.organization_id,
    patientId: r.patient_id,
    amount: Number(r.amount),
    receivedAt: r.received_at,
    method: r.payment_method,
    reference: r.reference || '',
    notes: r.notes || '',
  }));
};

const fetchCoverages = async (clinicId: string, patientId: string): Promise<Coverage[]> => {
  const { data, error } = await supabase
    .from('patient_coverages')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(toCoverage);
};

export const useOrganizationsQuery = () => {
  const { clinicId } = useAppContext();
  return useQuery({ queryKey: ['insurance-organizations', clinicId], queryFn: () => fetchOrganizations(clinicId as string), enabled: Boolean(clinicId) });
};

export const useClaimsQuery = () => {
  const { clinicId } = useAppContext();
  return useQuery({ queryKey: ['claims', clinicId], queryFn: () => fetchClaims(clinicId as string), enabled: Boolean(clinicId) });
};

export const useSettlementsQuery = () => {
  const { clinicId } = useAppContext();
  return useQuery({ queryKey: ['insurance-settlements', clinicId], queryFn: () => fetchSettlements(clinicId as string), enabled: Boolean(clinicId) });
};

export const useClaimLinesQuery = (claimId: string | null | undefined) =>
  useQuery({ queryKey: ['claim-lines', claimId], queryFn: () => fetchClaimLines(claimId as string), enabled: Boolean(claimId) });

const toLineParam = (l: Pick<ClaimLineInput, 'actId' | 'label' | 'quantity' | 'billed'>) =>
  ({ ...(l.actId ? { act_id: l.actId } : {}), label: l.label, quantity: l.quantity, billed_amount: l.billed });

// What the rules engine answers for each line (server-side, read-only, date of care = the visit's
// day). It never proposes an amount without a verified rule.
export const useLinesCalculation = (invoiceId: string | null | undefined, coverageId: string | null | undefined,
  lines: Array<Pick<ClaimLineInput, 'actId' | 'label' | 'quantity' | 'billed'>>) => {
  const params = lines.map(toLineParam);
  return useQuery({
    queryKey: ['insurance-calculation', invoiceId, coverageId, JSON.stringify(params)],
    queryFn: async (): Promise<LineCalculation[]> => {
      const data = await rpc('calculate_insurance_lines', { p_invoice_id: invoiceId, p_coverage_id: coverageId, p_lines: params });
      return (data.lines || []).map((r: any) => toLineCalculation(r, data.date_of_care));
    },
    enabled: Boolean(invoiceId && coverageId && params.length > 0),
    retry: false,
    placeholderData: (prev) => prev,
  });
};

export const useInsuranceContext = (invoiceId: string | null | undefined, coverageId: string | null | undefined) =>
  useQuery({
    queryKey: ['insurance-context', invoiceId, coverageId],
    queryFn: async (): Promise<InsuranceContext> => {
      const d = await rpc('get_insurance_context', { p_invoice_id: invoiceId, p_coverage_id: coverageId });
      return {
        dateOfCare: d.date_of_care, schemeCode: d.patient?.scheme_code ?? null,
        providerSector: d.provider?.sector ?? null, providerCategory: d.provider?.provider_category ?? null,
        specialty: d.provider?.specialty ?? null, missing: d.missing_context || [],
      };
    },
    enabled: Boolean(invoiceId && coverageId),
    retry: false,
  });

// Verified reference acts in force on the invoice's date of care (empty until real data exists).
export const useInsuranceActsSearch = (invoiceId: string | null | undefined, query: string, enabled = true) =>
  useQuery({
    queryKey: ['insurance-acts', invoiceId, query.trim()],
    queryFn: async (): Promise<InsuranceAct[]> =>
      (await rpc('search_insurance_acts', { p_invoice_id: invoiceId, p_query: query.trim() || null }) || []).map((a: any) => ({
        id: a.id, nomenclature: a.nomenclature, code: a.code, label: a.label, category: a.category,
      })),
    enabled: Boolean(invoiceId) && enabled,
    retry: false,
  });

export const useClaimContextQuery = (claimId: string | null | undefined) =>
  useQuery({
    queryKey: ['claim-context', claimId],
    queryFn: async (): Promise<ClaimContext | null> => {
      const { data, error } = await supabase.from('insurance_claim_contexts')
        .select('date_of_care, coverage, provider').eq('claim_id', claimId as string).maybeSingle();
      if (error) throw error;
      return data ? {
        dateOfCare: data.date_of_care, schemeCode: data.coverage?.scheme_code ?? null,
        providerSector: data.provider?.sector ?? null, providerCategory: data.provider?.provider_category ?? null,
      } : null;
    },
    enabled: Boolean(claimId),
  });

// The signed-in practitioner's insurance provider context (cabinet sector + own category).
export const useProviderContext = () => {
  const { clinicId, user } = useAppContext();
  return useQuery({
    queryKey: ['provider-context', clinicId, user?.id],
    queryFn: async () => {
      const [{ data: cab, error: e1 }, { data: prof, error: e2 }] = await Promise.all([
        supabase.from('cabinets').select('provider_sector_code').eq('id', clinicId as string).maybeSingle(),
        supabase.from('profiles').select('provider_category_code, specialite').eq('id', user?.id as string).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { sector: cab?.provider_sector_code ?? '', category: prof?.provider_category_code ?? '', specialty: prof?.specialite ?? '' };
    },
    enabled: Boolean(clinicId && user?.id),
  });
};

export const useSetProviderContext = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sector: string; category: string }) =>
      rpc('set_insurance_provider_context', { p_sector_code: v.sector || null, p_category_code: v.category || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-context'] });
      qc.invalidateQueries({ queryKey: ['insurance-context'] });
      qc.invalidateQueries({ queryKey: ['insurance-calculation'] });
    },
  });
};

export const usePatientCoveragesQuery = (patientId: string | null | undefined) => {
  const { clinicId } = useAppContext();
  return useQuery({
    queryKey: ['patient-coverages', clinicId, patientId],
    queryFn: () => fetchCoverages(clinicId as string, patientId as string),
    enabled: Boolean(clinicId && patientId),
  });
};

// Claims move invoice balances (third-party share, invoice status), so factures refresh with them.
const refreshAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['claims'] });
  qc.invalidateQueries({ queryKey: ['claim-lines'] });
  qc.invalidateQueries({ queryKey: ['claim-context'] });
  qc.invalidateQueries({ queryKey: ['insurance-context'] });
  qc.invalidateQueries({ queryKey: ['insurance-settlements'] });
  qc.invalidateQueries({ queryKey: ['insurance-organizations'] });
  qc.invalidateQueries({ queryKey: ['patient-coverages'] });
  qc.invalidateQueries({ queryKey: ['factures'] });
  qc.invalidateQueries({ queryKey: ['patient-factures'] });
  window.dispatchEvent(new CustomEvent('mm:payments-changed'));
};

export interface OrganizationInput {
  id?: string | null;
  name: string;
  type: OrganizationType;
  code?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive?: boolean;
}

export const useSaveOrganization = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: OrganizationInput): Promise<Organization> => toOrganization(await rpc('upsert_insurance_organization', {
      p_id: v.id ?? null, p_name: v.name, p_organization_type: v.type, p_code: v.code ?? null,
      p_contact_name: v.contactName ?? null, p_phone: v.phone ?? null, p_email: v.email ?? null,
      p_address: v.address ?? null, p_is_active: v.isActive ?? true,
    })),
    onSuccess: () => refreshAll(qc),
  });
};

export interface CoverageInput {
  id?: string | null;
  patientId: string;
  type: CoverageType;
  organizationId: string | null;
  membershipNumber?: string;
  beneficiary?: BeneficiaryType;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
  notes?: string;
  schemeCode?: string | null;
}

export const useSaveCoverage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CoverageInput) => rpc('upsert_patient_coverage', {
      p_id: v.id ?? null, p_patient_id: v.patientId, p_coverage_type: v.type,
      p_organization_id: v.type === 'NONE' ? null : v.organizationId,
      p_membership_number: v.membershipNumber ?? null, p_beneficiary_type: v.beneficiary ?? 'UNKNOWN',
      p_valid_from: v.validFrom || null, p_valid_until: v.validUntil || null,
      p_is_active: v.isActive ?? true, p_notes: v.notes ?? null,
      p_scheme_code: v.type === 'AMO' ? (v.schemeCode || null) : null,
    }),
    onSuccess: () => refreshAll(qc),
  });
};

// Creates the claim with its lines (one per medical act, or manual lines). The server recalculates
// every line: without a manual amount the engine's own amount is used (only possible when it
// CALCULATED one); with it, the amount is recorded as entered by hand, next to the engine's answer.
export const useCreateClaim = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { invoiceId: string; coverageId: string; lines: ClaimLineInput[]; status: 'DRAFT' | 'READY'; notes?: string }) =>
      rpc('create_insurance_claim_with_lines', {
        p_invoice_id: v.invoiceId,
        p_coverage_id: v.coverageId,
        p_lines: v.lines.map(l => ({
          ...toLineParam(l),
          ...(l.manualAmount !== null ? { manual_organism_amount: l.manualAmount, manual_reason: l.manualReason } : {}),
        })),
        p_status: v.status,
        p_notes: v.notes ?? null,
      }),
    onSuccess: () => refreshAll(qc),
  });
};

export const useClaimStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: ClaimStatus; reference?: string; notes?: string }) =>
      rpc('update_claim_status', { p_claim_id: v.id, p_status: v.status, p_external_reference: v.reference ?? null, p_notes: v.notes ?? null }),
    onSuccess: () => refreshAll(qc),
  });
};

// Money received from the organism. `key` is generated once per form so a double submit records
// a single settlement (the server returns the first one).
export const useRecordSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; amount: number; method: SettlementMethod; receivedAt: string; reference?: string; notes?: string; key: string }) =>
      rpc('record_insurance_settlement', {
        p_claim_id: v.id, p_amount: v.amount, p_payment_method: v.method, p_received_at: v.receivedAt,
        p_reference: v.reference ?? null, p_notes: v.notes ?? null, p_idempotency_key: v.key,
      }),
    onSuccess: () => refreshAll(qc),
  });
};

export const useRejectClaim = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string; amount?: number }) =>
      rpc('reject_insurance_claim', { p_claim_id: v.id, p_reason: v.reason, p_amount: v.amount ?? null }),
    onSuccess: () => refreshAll(qc),
  });
};

// The three explicit resolutions of a refused amount.
export const useResolveRejection = () => {
  const qc = useQueryClient();
  return useMutation({
    // id = the rejection (one refused amount), not the claim
    mutationFn: (v: { rejectionId: string; resolution: RejectionResolution; note?: string; coverageId?: string | null }) => {
      if (v.resolution === 'REFILED') return rpc('refile_insurance_claim', { p_rejection_id: v.rejectionId, p_coverage_id: v.coverageId ?? null, p_notes: v.note ?? null });
      if (v.resolution === 'TRANSFERRED_TO_PATIENT') return rpc('transfer_rejection_to_patient', { p_rejection_id: v.rejectionId, p_note: v.note ?? null });
      return rpc('waive_rejected_amount', { p_rejection_id: v.rejectionId, p_reason: v.note ?? '' });
    },
    onSuccess: () => refreshAll(qc),
  });
};
