// Types and money helpers for the Facturation module.
//
// Source of truth: the `payments` table, one row per visit (written when a
// consultation is finished, collected through process_visit_payment):
//   amount             = billed amount                        -> Facture.montant
//   third_party_amount = share an organism pays (tiers payant) -> Facture.partOrganisme
//   amount_paid        = collected from the patient so far     -> Facture.paye
//   reste (patient)    = amount - third_party_amount - amount_paid
// The organism's share is not a patient debt: it is tracked on its tiers-payant claim.
//
// Every balance below comes from the server's reconciliation (view invoice_financials), the single
// authoritative model. Components read Facture.fin; they never recompute a balance themselves, and
// never use a claim's patient_share (a historical snapshot taken when the claim was created).
// Amounts are final (no VAT is added on top of what the doctor billed).

export type Statut = 'payee' | 'partielle' | 'en_attente' | 'en_retard';
export type Mode = 'Especes' | 'Carte' | 'Virement' | 'Tiers payant' | 'Autre';

export type ModePaiementFacture = 'PATIENT' | 'TIERS_PAYANT';

export interface Paiement { id: string; date: string; montant: number; mode: Mode; }

export interface FactureLigne {
  id: string;
  libelle: string;
  prixUnitaire: number;
  quantite: number;
}

// Server-side reconciliation of one invoice (invoice_financials). Every DH of an open invoice is in
// exactly one bucket: paye + patientDue + organismReceived + organismDue + rejectedUnresolved + waived.
export interface FactureFinancials {
  patientDue: number;
  organismShare: number;
  organismReceived: number;
  organismDue: number;
  rejectedUnresolved: number;
  waived: number;
  reconciled: boolean; // false = INCONSISTENT: do not present the figures as reliable
  problems: string[];
}

export interface Facture {
  id: string;
  numero: string;
  dateEmission: string;
  dateEcheance: string;
  visitId: string | null;
  consultationId?: string | null;
  praticienId: string;
  patientId: string;
  patientNom: string;
  assureurId: string; // patient's mutuelle label, '' when none
  montant: number;
  modePaiement: ModePaiementFacture;
  partOrganisme: number; // 0 unless the invoice is in tiers payant
  paye: number;
  statut: Statut;
  paiements: Paiement[];
  lignes?: FactureLigne[];
  fin?: FactureFinancials; // authoritative balances (absent only if the reconciliation could not be read)
}

// Display number of a facture (payment row).
export const numeroFacture = (paymentId: string) => `FAC-${String(paymentId).slice(0, 6).toUpperCase()}`;

// A pending balance becomes "en retard" this many days after the billing date
// (same 30-day term the invoice module uses for its due date).
export const DELAI_PAIEMENT_JOURS = 30;

export const factureNet = (f: Pick<Facture, 'montant'>) => f.montant;
export const facturePaye = (f: Pick<Facture, 'paye'>) => f.paye;
// What the patient still owes (the organism's share is excluded). Taken from the server's
// reconciliation; the fallback (same formula) only covers a row the reconciliation did not return.
export const factureReste = (f: Pick<Facture, 'montant' | 'paye'> & { partOrganisme?: number; fin?: FactureFinancials }) =>
  f.fin ? Math.max(0, f.fin.patientDue) : Math.max(0, f.montant - (f.partOrganisme || 0) - f.paye);

// Invoices whose figures do not reconcile. They are logged once and flagged in the UI instead of
// being shown as plausible numbers.
const reported = new Set<string>();
export const inconsistentFactures = (factures: Facture[]) => {
  const bad = factures.filter(f => f.fin && !f.fin.reconciled);
  bad.forEach(f => {
    if (reported.has(f.id)) return;
    reported.add(f.id);
    console.error('[facturation] invoice does not reconcile', { invoiceId: f.id, numero: f.numero, problems: f.fin?.problems, fin: f.fin });
  });
  return bad;
};
