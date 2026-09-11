import { Facture, factureNet, facturePaye, factureReste, Paiement } from './data';
import { FilterState } from './store';
import { joursRetard, fmtMonthShort } from './format';

export const filterFactures = (factures: Facture[], filters: FilterState) => {
  const now = new Date();
  let startMs = 0;
  if (filters.periode === '3m') startMs = now.getTime() - 90 * 86400000;
  else if (filters.periode === '6m') startMs = now.getTime() - 180 * 86400000;
  else if (filters.periode === '12m') startMs = now.getTime() - 365 * 86400000;

  return factures.filter(f => {
    if (startMs > 0 && new Date(f.dateEmission).getTime() < startMs) return false;
    if (filters.praticienId && f.praticienId !== filters.praticienId) return false;
    if (filters.assureurId && f.assureurId !== filters.assureurId) return false;
    if (filters.statut && f.statut !== filters.statut) return false;
    
    if (filters.recherche) {
      const q = filters.recherche.toLowerCase();
      const match = (
        f.numero.toLowerCase().includes(q) ||
        f.patientNom.toLowerCase().includes(q) ||
        f.patientRef.toLowerCase().includes(q) ||
        f.lignes.some(l => l.code.toLowerCase().includes(q) || l.libelle.toLowerCase().includes(q))
      );
      if (!match) return false;
    }
    return true;
  });
};

export const getTotals = (filteredFactures: Facture[]) => {
  let caNet = 0;
  let totalEncaisse = 0;
  let count = 0;
  let enRetardAmount = 0;
  let enRetardCount = 0;

  filteredFactures.forEach(f => {
    if (f.statut === 'annulee' || f.statut === 'brouillon') return;
    const net = factureNet(f);
    const paye = facturePaye(f);
    caNet += net;
    totalEncaisse += paye;
    count++;
    
    if (f.statut === 'en_retard') {
      enRetardAmount += Math.max(0, net - paye);
      enRetardCount++;
    }
  });

  const resteAEncaisser = Math.max(0, caNet - totalEncaisse);
  const panierMoyen = count > 0 ? caNet / count : 0;
  const tauxRecouvrement = caNet > 0 ? totalEncaisse / caNet : 0;

  return { caNet, totalEncaisse, resteAEncaisser, panierMoyen, tauxRecouvrement, count, enRetardAmount, enRetardCount };
};

export const getMonthlySeries = (factures: Facture[]) => {
  const map = new Map<string, { mois: string; dateVal: Date; ca: number; encaisse: number }>();
  
  // Initialize last 8 months
  const d = new Date();
  d.setDate(1); // avoid end-of-month skips
  for (let i = 0; i < 8; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, { mois: fmtMonthShort(d.toISOString()), dateVal: new Date(d), ca: 0, encaisse: 0 });
    d.setMonth(d.getMonth() - 1);
  }

  factures.forEach(f => {
    if (f.statut === 'annulee' || f.statut === 'brouillon') return;
    
    const emissionDate = new Date(f.dateEmission);
    const eKey = `${emissionDate.getFullYear()}-${String(emissionDate.getMonth() + 1).padStart(2, '0')}`;
    if (map.has(eKey)) {
      map.get(eKey)!.ca += factureNet(f);
    }
    
    f.paiements.forEach(p => {
      const pDate = new Date(p.date);
      const pKey = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(pKey)) {
        map.get(pKey)!.encaisse += p.montant;
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.dateVal.getTime() - b.dateVal.getTime());
};

export const getBreakdowns = (factures: Facture[]) => {
  const byStatut = new Map<string, { count: number; amount: number }>();
  const byAssureur = new Map<string, number>();
  const byPraticien = new Map<string, number>();
  const byActe = new Map<string, { libelle: string; count: number; amount: number }>();

  factures.forEach(f => {
    if (f.statut === 'brouillon') return;
    
    // Statut
    const st = byStatut.get(f.statut) || { count: 0, amount: 0 };
    st.count++;
    st.amount += factureNet(f);
    byStatut.set(f.statut, st);

    if (f.statut === 'annulee') return;

    // Assureur
    byAssureur.set(f.assureurId, (byAssureur.get(f.assureurId) || 0) + factureNet(f));

    // Praticien
    byPraticien.set(f.praticienId, (byPraticien.get(f.praticienId) || 0) + factureNet(f));

    // Actes
    f.lignes.forEach(l => {
      const lineTotal = l.pu * l.qte * (1 - f.remise / 100) * 1.2; // approx net equivalent per line
      const act = byActe.get(l.code) || { libelle: l.libelle, count: 0, amount: 0 };
      act.count += l.qte;
      act.amount += lineTotal;
      byActe.set(l.code, act);
    });
  });

  const topActes = Array.from(byActe.entries())
    .map(([code, data]) => ({ code, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return { byStatut, byAssureur, byPraticien, topActes };
};

export const getAgeingBuckets = (factures: Facture[]) => {
  const buckets = [
    { label: '0-30', min: 0, max: 30, amount: 0 },
    { label: '31-60', min: 31, max: 60, amount: 0 },
    { label: '61-90', min: 61, max: 90, amount: 0 },
    { label: '90+', min: 91, max: Infinity, amount: 0 },
  ];

  factures.forEach(f => {
    if (f.statut === 'annulee' || f.statut === 'brouillon') return;
    const reste = factureReste(f);
    if (reste <= 0) return;
    
    const delay = joursRetard(f.dateEcheance);
    const bucket = buckets.find(b => delay >= b.min && delay <= b.max);
    if (bucket) bucket.amount += reste;
  });

  return buckets;
};

export const getPaiementsJournal = (factures: Facture[]) => {
  const journal: { facture: Facture; paiement: Paiement }[] = [];
  factures.forEach(f => {
    f.paiements.forEach(paiement => {
      journal.push({ facture: f, paiement });
    });
  });
  return journal.sort((a, b) => new Date(b.paiement.date).getTime() - new Date(a.paiement.date).getTime());
};

export interface DebiteurInfo {
  patientNom: string;
  patientRef: string;
  resteDu: number;
  nbFactures: number;
  retardMax: number;
  factures: Facture[];
}

export const getDebiteurs = (factures: Facture[]): DebiteurInfo[] => {
  const map = new Map<string, DebiteurInfo>();
  
  factures.forEach(f => {
    if (f.statut === 'annulee' || f.statut === 'brouillon') return;
    const reste = factureReste(f);
    if (reste <= 0) return;
    
    const retard = joursRetard(f.dateEcheance);
    
    if (!map.has(f.patientRef)) {
      map.set(f.patientRef, {
        patientNom: f.patientNom,
        patientRef: f.patientRef,
        resteDu: 0,
        nbFactures: 0,
        retardMax: 0,
        factures: []
      });
    }
    
    const info = map.get(f.patientRef)!;
    info.resteDu += reste;
    info.nbFactures++;
    info.retardMax = Math.max(info.retardMax, retard);
    info.factures.push(f);
  });

  return Array.from(map.values()).sort((a, b) => b.resteDu - a.resteDu);
};

export const getDSO = (factures: Facture[]) => {
  let sumDays = 0;
  let countPaid = 0;

  factures.forEach(f => {
    if (f.statut !== 'payee') return;
    const emDate = new Date(f.dateEmission).getTime();
    
    // Last payment date
    let lastPayTime = emDate;
    f.paiements.forEach(p => {
      const pTime = new Date(p.date).getTime();
      if (pTime > lastPayTime) lastPayTime = pTime;
    });
    
    sumDays += Math.max(0, (lastPayTime - emDate) / 86400000);
    countPaid++;
  });

  const dso = countPaid > 0 ? Math.round(sumDays / countPaid) : 0;
  let label = "Délais d'encaissement à surveiller";
  if (dso <= 7) label = "Excellente rapidité d'encaissement";
  else if (dso <= 21) label = "Délai d'encaissement normal";
  
  return { dso, label };
};
