// Types and money helpers for the Facturation module.
//
// Source of truth: the `payments` table, one row per visit (written when a
// consultation is finished, collected through process_visit_payment):
//   amount             = billed amount                        -> Facture.montant
//   third_party_amount = share an organism pays (tiers payant) -> Facture.partOrganisme
//   amount_paid        = collected from the patient so far     -> Facture.paye
//   reste (patient)    = amount - third_party_amount - amount_paid
// The organism's share is not a patient debt: it is tracked on its tiers-payant claim.
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
}

// Display number of a facture (payment row).
export const numeroFacture = (paymentId: string) => `FAC-${String(paymentId).slice(0, 6).toUpperCase()}`;

// A pending balance becomes "en retard" this many days after the billing date
// (same 30-day term the invoice module uses for its due date).
export const DELAI_PAIEMENT_JOURS = 30;

export const factureNet = (f: Pick<Facture, 'montant'>) => f.montant;
export const facturePaye = (f: Pick<Facture, 'paye'>) => f.paye;
// What the patient still owes (the organism's share is excluded).
export const factureReste = (f: Pick<Facture, 'montant' | 'paye'> & { partOrganisme?: number }) =>
  Math.max(0, f.montant - (f.partOrganisme || 0) - f.paye);
