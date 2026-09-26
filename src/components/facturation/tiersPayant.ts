import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '../../context/AppContext';

// Tiers payant: the insurers a clinic works with (CNSS, CNOPS, mutuelles...) and the claims filed
// against them. Claims are prepared, exported and followed by hand; nothing calls an insurer system.
// Reads are plain selects (RLS scopes them to the clinic); every write is a SECURITY DEFINER RPC.
// A reimbursement is collected through process_visit_payment ('insurance'), so the invoice balance
// in Factures / Débiteurs moves with it.

export type InsurerKind = 'cnss' | 'cnops' | 'mutuelle' | 'prive';
export type ClaimStatus = 'a_deposer' | 'depose' | 'rembourse' | 'rejete' | 'annule';

export interface Insurer { id: string; name: string; kind: InsurerKind; defaultRate: number; }

export interface Claim {
  id: string;
  paymentId: string;
  patientId: string;
  patientNom: string;
  patientCin: string;
  numeroCnss: string;
  insurerId: string;
  total: number;
  rate: number;
  insurerShare: number;
  patientShare: number;
  status: ClaimStatus;
  reference: string;
  note: string;
  createdAt: string;
  submittedAt: string | null;
  reimbursedAt: string | null;
  reimbursed: number;
}

export const INSURER_KINDS: InsurerKind[] = ['cnss', 'cnops', 'mutuelle', 'prive'];

export const KIND_LABEL: Record<InsurerKind, string> = {
  cnss: 'CNSS',
  cnops: 'CNOPS',
  mutuelle: 'Mutuelle',
  prive: 'Assurance privée',
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; cls: string; dot: string }> = {
  a_deposer: { label: 'À déposer', cls: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200', dot: 'bg-slate-400' },
  depose: { label: 'Déposé', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', dot: 'bg-blue-500' },
  rembourse: { label: 'Remboursé', cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  rejete: { label: 'Rejeté', cls: 'bg-red-50 text-red-700 ring-1 ring-red-200', dot: 'bg-red-500' },
  annule: { label: 'Annulé', cls: 'bg-slate-50 text-slate-400 ring-1 ring-slate-200', dot: 'bg-slate-300' },
};

// What the insurer still owes on a claim.
export const claimOpenAmount = (c: Claim) =>
  c.status === 'depose' || c.status === 'a_deposer' ? Math.max(0, c.insurerShare - c.reimbursed) : 0;

const ERRORS: Array<[RegExp, string]> = [
  [/already exists/i, 'Une demande existe déjà pour cette facture.'],
  [/already settled/i, 'Cette facture est déjà soldée.'],
  [/not linked to a visit/i, "Cette facture n'est liée à aucune visite."],
  [/no insurer/i, 'Choisissez un organisme.'],
  [/must be submitted/i, "La demande doit d'abord être marquée comme déposée."],
  [/exceeds what the insurer still owes/i, "Le montant dépasse ce que l'organisme doit encore."],
  [/exceeds the invoice balance/i, 'Le montant dépasse le reste à payer de la facture.'],
  [/partly reimbursed/i, 'Cette demande est déjà en partie remboursée.'],
  [/claim is closed/i, 'Cette demande est clôturée.'],
  [/insurers_clinic_name_uniq|duplicate key/i, 'Un organisme porte déjà ce nom.'],
  [/permission/i, "Vous n'avez pas l'autorisation d'effectuer cette action."],
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

const fetchInsurers = async (clinicId: string): Promise<Insurer[]> => {
  const { data, error } = await supabase
    .from('insurers')
    .select('id, name, kind, default_rate')
    .eq('clinic_id', clinicId)
    .order('name');
  if (error) throw error;
  return (data || []).map((r: any) => ({ id: r.id, name: r.name, kind: r.kind, defaultRate: Number(r.default_rate) }));
};

const fetchClaims = async (clinicId: string): Promise<Claim[]> => {
  const { data, error } = await supabase
    .from('insurance_claims')
    .select('*, patients:patient_id(nom, prenom, cin, numero_cnss)')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data || []).map((r: any): Claim => ({
    id: r.id,
    paymentId: r.payment_id,
    patientId: r.patient_id,
    patientNom: r.patients ? `${r.patients.prenom || ''} ${r.patients.nom || ''}`.trim() || 'Patient inconnu' : 'Patient inconnu',
    patientCin: r.patients?.cin || '',
    numeroCnss: r.patients?.numero_cnss || '',
    insurerId: r.insurer_id,
    total: Number(r.amount_total),
    rate: Number(r.coverage_rate),
    insurerShare: Number(r.amount_insurer),
    patientShare: Number(r.amount_patient),
    status: r.status,
    reference: r.reference || '',
    note: r.note || '',
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    reimbursedAt: r.reimbursed_at,
    reimbursed: Number(r.reimbursed_amount),
  }));
};

export const useInsurersQuery = () => {
  const { clinicId } = useAppContext();
  return useQuery({ queryKey: ['insurers', clinicId], queryFn: () => fetchInsurers(clinicId as string), enabled: Boolean(clinicId) });
};

export const useClaimsQuery = () => {
  const { clinicId } = useAppContext();
  return useQuery({ queryKey: ['claims', clinicId], queryFn: () => fetchClaims(clinicId as string), enabled: Boolean(clinicId) });
};

// Reimbursements move the invoice balance, so factures are refreshed with the claims.
const refreshAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['claims'] });
  qc.invalidateQueries({ queryKey: ['insurers'] });
  qc.invalidateQueries({ queryKey: ['factures'] });
  window.dispatchEvent(new CustomEvent('mm:payments-changed'));
};

export const useSaveInsurer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string | null; name: string; kind: InsurerKind; defaultRate: number }) =>
      rpc('upsert_insurer', { p_id: v.id ?? null, p_name: v.name, p_kind: v.kind, p_default_rate: v.defaultRate }),
    onSuccess: () => refreshAll(qc),
  });
};

export const useCreateClaim = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { paymentId: string; patientId: string; insurerId: string; rate: number; saveForPatient: boolean }) => {
      await rpc('create_insurance_claim', { p_payment_id: v.paymentId, p_insurer_id: v.insurerId, p_rate: v.rate });
      if (v.saveForPatient) await rpc('set_patient_coverage', { p_patient_id: v.patientId, p_insurer_id: v.insurerId, p_rate: v.rate });
    },
    onSuccess: () => refreshAll(qc),
  });
};

export const useClaimStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: ClaimStatus; reference?: string; note?: string }) =>
      rpc('update_claim_status', { p_claim_id: v.id, p_status: v.status, p_reference: v.reference ?? null, p_note: v.note ?? null }),
    onSuccess: () => refreshAll(qc),
  });
};

export const useReimbursement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; amount: number; reference?: string }) =>
      rpc('record_claim_reimbursement', { p_claim_id: v.id, p_amount: v.amount, p_reference: v.reference ?? null }),
    onSuccess: () => refreshAll(qc),
  });
};
