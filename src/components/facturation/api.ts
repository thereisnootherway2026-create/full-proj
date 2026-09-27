import { supabase } from '@/lib/supabase';
import { processVisitPayment } from '@/lib/visitService';
import { DELAI_PAIEMENT_JOURS, Facture, FactureLigne, Mode, Paiement, Statut, factureReste, numeroFacture } from './data';

const PAGE_SIZE = 1000;
const MS_DAY = 86400000;

const modeFromDB = (method: string | null): Mode => {
  switch (method) {
    case 'cash': return 'Especes';
    case 'card': return 'Carte';
    case 'transfer': return 'Virement';
    case 'insurance': return 'Tiers payant'; // historical organism collections (before claims)
    default: return 'Autre';
  }
};

const computeStatut = (status: string, amount: number, paid: number, createdAt: string): Statut => {
  if (status === 'paid') return 'payee';
  const age = (Date.now() - new Date(createdAt).getTime()) / MS_DAY;
  if (age > DELAI_PAIEMENT_JOURS) return 'en_retard';
  return paid > 0 ? 'partielle' : 'en_attente';
};

// Every billed visit of the clinic (paid or still owing). Waived / cancelled / refunded rows
// carry no revenue and are left out. Tenant scope: explicit clinic_id filter, and RLS on top.
// With `patientId`, only that patient's factures (still scoped to the clinic).
export const fetchFactures = async (clinicId: string, patientId?: string): Promise<Facture[]> => {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('payments')
      .select('id, visit_id, consultation_id, patient_id, amount, amount_paid, third_party_amount, payment_mode, status, method, paid_at, created_at, visits:visit_id(doctor_id), patients:patient_id(nom, prenom, mutuelle)')
      .eq('clinic_id', clinicId)
      .in('status', ['pending', 'paid']);
    if (patientId) query = query.eq('patient_id', patientId);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  // Fetch itemized lines for any linked consultations
  const consultIds = Array.from(new Set(rows.map(r => r.consultation_id).filter(Boolean)));
  const lignesByConsultId: Record<string, FactureLigne[]> = {};
  if (consultIds.length > 0) {
    try {
      const { data: lignesData } = await supabase
        .from('facture_lignes')
        .select('id, consultation_id, libelle_snapshot, prix_unitaire_snapshot, quantite')
        .in('consultation_id', consultIds);

      if (lignesData) {
        lignesData.forEach((l: any) => {
          if (!lignesByConsultId[l.consultation_id]) lignesByConsultId[l.consultation_id] = [];
          lignesByConsultId[l.consultation_id].push({
            id: l.id,
            libelle: l.libelle_snapshot,
            prixUnitaire: Number(l.prix_unitaire_snapshot) || 0,
            quantite: Number(l.quantite) || 1,
          });
        });
      }
    } catch {
      // Non-blocking fallback
    }
  }

  return rows.map((p): Facture => {
    const montant = Number(p.amount) || 0;
    const paye = Number(p.amount_paid) || 0;
    const patient = p.patients;
    const paiements: Paiement[] = paye > 0
      ? [{ id: p.id, date: p.paid_at || p.created_at, montant: paye, mode: modeFromDB(p.method) }]
      : [];

    const explicitLignes = p.consultation_id ? lignesByConsultId[p.consultation_id] : undefined;
    const lignes: FactureLigne[] = explicitLignes && explicitLignes.length > 0
      ? explicitLignes
      : [{
          id: `default-${p.id}`,
          libelle: 'Consultation & Prestations médicales',
          prixUnitaire: montant,
          quantite: 1,
        }];

    return {
      id: p.id,
      numero: numeroFacture(p.id),
      dateEmission: p.created_at,
      dateEcheance: new Date(new Date(p.created_at).getTime() + DELAI_PAIEMENT_JOURS * MS_DAY).toISOString(),
      visitId: p.visit_id || null,
      consultationId: p.consultation_id || null,
      praticienId: p.visits?.doctor_id || '',
      patientId: p.patient_id,
      patientNom: patient ? `${patient.prenom || ''} ${patient.nom || ''}`.trim() || 'Patient inconnu' : 'Patient inconnu',
      assureurId: patient?.mutuelle ? String(patient.mutuelle) : '',
      montant,
      modePaiement: p.payment_mode === 'TIERS_PAYANT' ? 'TIERS_PAYANT' : 'PATIENT',
      partOrganisme: Number(p.third_party_amount) || 0,
      paye,
      statut: computeStatut(p.status, montant, paye, p.created_at),
      paiements,
      lignes,
    };
  });
};

// Collect through the same RPC the cashier queue uses. A collection below the remaining balance
// is sent as an explicit partial payment; the RPC rejects any other short payment.
// method is the database value accepted by process_visit_payment: cash | card | transfer. Only the
// patient's share is collected here; an organism pays through its tiers-payant claim.
export const encaisserFacture = async (facture: Facture, montant: number, method: string) => {
  if (!facture.visitId) throw new Error('Cette facture n\'est liée à aucune visite : encaissement impossible.');
  const reste = factureReste(facture);
  return processVisitPayment(facture.visitId, method, montant, { partial: montant < reste });
};
