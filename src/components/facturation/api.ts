import { supabase } from '@/lib/supabase';
import { Facture, Paiement, Statut } from './data';

const mapStatut = (dbStatut: string): Statut => {
  return dbStatut as Statut;
};

const mapMethodToDB = (frenchMethod: string): string => {
  switch (frenchMethod) {
    case 'Especes': return 'cash';
    case 'Carte': return 'card';
    case 'Virement': return 'transfer';
    case 'Chèque': return 'cheque';
    default: return 'cash';
  }
};

const mapMethodFromDB = (dbMethod: string): 'Especes' | 'Carte' | 'Virement' | 'Chèque' => {
  switch (dbMethod) {
    case 'cash': return 'Especes';
    case 'card': return 'Carte';
    case 'transfer': return 'Virement';
    case 'cheque': return 'Chèque';
    default: return 'Especes';
  }
};

export const fetchFactures = async (filters: any): Promise<Facture[]> => {
  const { recherche, periode, praticienId, assureurId, statut } = filters;
  
  let query = supabase
    .from('consultations')
    .select(`
      id, numero, emitted_at, date_echeance, statut, remise, relance,
      patient_id,
      patients ( nom, prenom, mutuelle ),
      facture_lignes ( id, libelle_snapshot, prix_unitaire_snapshot, quantite ),
      payments ( id, amount, method, paid_at )
    `)
    .neq('statut', 'brouillon');
    
  if (statut) query = query.eq('statut', statut);
  if (praticienId) query = query.eq('doctor_id', praticienId);
  // Filtering on relation properties (like patients.mutuelle) is harder in PostgREST but let's do post-filter for simple searches

  const { data, error } = await query;
  if (error) throw error;

  let result = data.map((d: any) => ({
    id: d.id,
    numero: d.numero || '—',
    dateEmission: d.emitted_at ? d.emitted_at.split('T')[0] : '',
    dateEcheance: d.date_echeance,
    patientId: d.patient_id,
    patientNom: d.patients ? `${d.patients.nom} ${d.patients.prenom}` : 'Inconnu',
    praticienId: d.doctor_id || '',
    assureur: d.patients?.mutuelle || '',
    statut: mapStatut(d.statut),
    remise: d.remise || 0,
    relance: d.relance || false,
    lignes: d.facture_lignes.map((l: any) => ({
      id: l.id,
      description: l.libelle_snapshot,
      prixUnitaire: l.prix_unitaire_snapshot,
      quantite: l.quantite
    })),
    paiements: d.payments.filter((p: any) => p.status !== 'cancelled').map((p: any) => ({
      id: p.id,
      date: p.paid_at.split('T')[0],
      montant: p.amount,
      mode: mapMethodFromDB(p.method)
    }))
  }));

  // Client side complex filters
  if (assureurId) {
    result = result.filter(f => f.assureur === assureurId);
  }
  if (recherche) {
    const term = recherche.toLowerCase();
    result = result.filter(f => 
      f.numero.toLowerCase().includes(term) || 
      f.patientNom.toLowerCase().includes(term)
    );
  }
  if (periode) {
    const days = periode === '3m' ? 90 : periode === '6m' ? 180 : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    result = result.filter(f => new Date(f.dateEmission) >= cutoff);
  }

  // Sort by dateEmission desc
  result.sort((a, b) => new Date(b.dateEmission).getTime() - new Date(a.dateEmission).getTime());
  
  return result;
};

export const createFacture = async (draft: any) => {
  const payload = {
    p_patient_id: draft.patientId || 'b0000001-0000-0000-0000-000000000001', // Fallback for demo patients without UUID
    p_doctor_id: draft.praticienId,
    p_remise: draft.remise || 0,
    p_lignes: draft.lignes.map((l: any) => ({
      acte_id: null,
      libelle_snapshot: l.libelle || l.description,
      prix_unitaire_snapshot: l.pu || l.prixUnitaire,
      quantite: l.qte || l.quantite
    }))
  };
  const { data: id, error } = await supabase.rpc('create_facture', payload);
  if (error) throw error;
  
  if (!draft.brouillon) {
    const { error: emitErr } = await supabase.rpc('emit_facture', { p_id: id });
    if (emitErr) throw emitErr;
  }
  return id;
};

export const cancelFacture = async (id: string, reason: string) => {
  const { error } = await supabase.rpc('cancel_facture', { p_id: id, p_reason: reason });
  if (error) throw error;
};

export const addPaiementAPI = async (factureId: string, p: any) => {
  const { data, error } = await supabase.rpc('record_payment_guarded', {
    p_consultation_id: factureId,
    p_amount: p.montant,
    p_method: mapMethodToDB(p.mode)
  });
  if (error) throw error;
  return data;
};

export const removePaiementAPI = async (paiementId: string) => {
  const { error } = await supabase.rpc('delete_payment_guarded', { p_payment_id: paiementId });
  if (error) throw error;
};

export const markRelanceAPI = async (factureId: string, value: boolean) => {
  const { error } = await supabase.from('consultations').update({ relance: value }).eq('id', factureId);
  if (error) throw error;
};

export const fetchStatsAPI = async (filters: any) => {
  const periode = filters.periode === '3m' ? 90 : filters.periode === '6m' ? 180 : 365;
  const { data, error } = await supabase.rpc('get_facturation_stats', {
    p_periode: periode,
    p_praticien: filters.praticienId || null,
    p_assureur: filters.assureurId || null
  });
  if (error) throw error;
  return data;
};

export const fetchDebiteursAPI = async () => {
  const { data, error } = await supabase.rpc('get_debiteurs');
  if (error) throw error;
  return data || [];
};
