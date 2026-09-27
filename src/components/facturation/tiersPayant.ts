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
//
// A patient who pays everything and gets reimbursed later is not a claim: nothing is owed to the
// cabinet. No reimbursement rate is computed anywhere: the organism's share is entered by the user.
// Reads are plain selects (RLS scopes them to the clinic). Every write is a SECURITY DEFINER RPC.

export type OrganizationType = 'AMO_MANAGER' | 'MUTUELLE' | 'PRIVATE_INSURER' | 'OTHER';
export type CoverageType = 'AMO' | 'COMPLEMENTARY' | 'PRIVATE_INSURANCE' | 'NONE';
export type BeneficiaryType = 'ASSURE' | 'AYANT_DROIT' | 'UNKNOWN';
export type ClaimStatus =
  | 'DRAFT' | 'READY' | 'SUBMITTED' | 'PROCESSING' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'REJECTED' | 'CANCELLED';

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
  createdAt: string;
  submittedAt: string | null;
  receivedAt: string | null;
}

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
export const claimOutstanding = (c: Pick<Claim, 'claimed' | 'received' | 'rejected'>) =>
  Math.max(0, c.claimed - c.received - c.rejected);

// A coverage that can back a new claim today.
export const isCoverageUsable = (c: Coverage, today = new Date().toISOString().slice(0, 10)) =>
  c.isActive && c.type !== 'NONE' && !!c.organizationId
  && (!c.validFrom || c.validFrom <= today) && (!c.validUntil || c.validUntil >= today);

const ERRORS: Array<[RegExp, string]> = [
  [/already exists for this invoice/i, 'Un dossier en tiers payant existe déjà pour cette facture.'],
  [/invoice is not open/i, "Cette facture n'est plus ouverte : le patient l'a déjà réglée ou elle est annulée."],
  [/not linked to a visit/i, "Cette facture n'est liée à aucune visite."],
  [/visit is cancelled/i, 'La visite de cette facture est annulée.'],
  [/coverage belongs to another patient/i, "Cette couverture appartient à un autre patient."],
  [/coverage is not active/i, "La couverture choisie n'est pas active."],
  [/coverage is not valid today/i, "La couverture choisie n'est pas valide à ce jour."],
  [/organization is inactive/i, "L'organisme de cette couverture est désactivé."],
  [/exceeds what is still unpaid/i, 'La part organisme dépasse le reste à payer de la facture.'],
  [/amount claimed must be positive/i, 'Saisissez la part prise en charge par l’organisme.'],
  [/must be submitted before a settlement/i, "Le dossier doit d'abord être déposé."],
  [/exceeds the outstanding amount/i, "Le montant dépasse ce que l'organisme doit encore."],
  [/rejection reason is required/i, 'Indiquez le motif du rejet.'],
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

const fetchClaims = async (clinicId: string): Promise<Claim[]> => {
  const { data, error } = await supabase
    .from('insurance_claims')
    // embedded through the same-clinic (composite) foreign keys, named explicitly
    .select('*, patients:patients!insurance_claims_patient_fkey(nom, prenom), visits:visits!insurance_claims_visit_fkey(doctor_id)')
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
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    receivedAt: r.received_at,
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
    }),
    onSuccess: () => refreshAll(qc),
  });
};

export const useCreateClaim = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { invoiceId: string; coverageId: string; amount: number; status: 'DRAFT' | 'READY'; notes?: string }) =>
      rpc('create_insurance_claim', {
        p_invoice_id: v.invoiceId, p_coverage_id: v.coverageId, p_amount_claimed: v.amount,
        p_status: v.status, p_notes: v.notes ?? null,
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

export const useClaimSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; received: number; rejected: number; reason?: string; reference?: string }) =>
      rpc('record_claim_settlement', {
        p_claim_id: v.id, p_amount_received: v.received, p_amount_rejected: v.rejected,
        p_rejection_reason: v.reason ?? null, p_external_reference: v.reference ?? null, p_received_at: null,
      }),
    onSuccess: () => refreshAll(qc),
  });
};

export const useRejectClaim = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => rpc('reject_insurance_claim', { p_claim_id: v.id, p_reason: v.reason }),
    onSuccess: () => refreshAll(qc),
  });
};
