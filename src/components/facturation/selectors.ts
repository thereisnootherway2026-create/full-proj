import { Facture, facturePaye, factureReste, Paiement } from './data';
import { FilterState } from './store';
import { joursRetard, fmtMonthShort } from './format';

// Start of the selected period (ms), 0 for "Depuis toujours".
export const periodeStartMs = (periode: FilterState['periode']) => {
  const now = Date.now();
  if (periode === '1d') return now - 86400000;
  if (periode === '7d') return now - 7 * 86400000;
  if (periode === '1m') return now - 30 * 86400000;
  if (periode === '3m') return now - 90 * 86400000;
  if (periode === '6m') return now - 180 * 86400000;
  if (periode === '12m') return now - 365 * 86400000;
  return 0;
};

export const filterFactures = (factures: Facture[], filters: FilterState) => {
  const startMs = periodeStartMs(filters.periode);

  return factures.filter(f => {
    if (startMs > 0 && new Date(f.dateEmission).getTime() < startMs) return false;
    if (filters.praticienId && f.praticienId !== filters.praticienId) return false;
    if (filters.assureurId && f.assureurId !== filters.assureurId) return false;
    if (filters.statut && f.statut !== filters.statut) return false;
    if (filters.patientId && f.patientId !== filters.patientId) return false;

    if (filters.recherche) {
      const q = filters.recherche.toLowerCase();
      if (!f.numero.toLowerCase().includes(q) && !f.patientNom.toLowerCase().includes(q)) return false;
    }
    return true;
  });
};

export const getTotals = (filteredFactures: Facture[]) => {
  let caNet = 0;
  let totalEncaisse = 0;
  let facturesPayeesCount = 0;
  let enRetardAmount = 0;
  let enRetardCount = 0;

  filteredFactures.forEach(f => {
    caNet += f.montant;
    totalEncaisse += f.paye;
    if (f.statut === 'payee') facturesPayeesCount++;
    if (f.statut === 'en_retard') {
      enRetardAmount += factureReste(f);
      enRetardCount++;
    }
  });

  const count = filteredFactures.length;
  const resteAEncaisser = Math.max(0, caNet - totalEncaisse);
  const panierMoyen = count > 0 ? caNet / count : 0;
  const tauxRecouvrement = caNet > 0 ? totalEncaisse / caNet : 0;

  return { caNet, totalEncaisse, resteAEncaisser, panierMoyen, tauxRecouvrement, count, facturesPayeesCount, enRetardAmount, enRetardCount };
};

// Last 8 calendar months. Months with no activity are real zeros.
export const getMonthlySeries = (factures: Facture[]) => {
  const map = new Map<string, { mois: string; dateVal: Date; ca: number; encaisse: number }>();

  const d = new Date();
  d.setDate(1); // avoid end-of-month skips
  for (let i = 0; i < 8; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, { mois: fmtMonthShort(d.toISOString()), dateVal: new Date(d), ca: 0, encaisse: 0 });
    d.setMonth(d.getMonth() - 1);
  }

  factures.forEach(f => {
    const e = new Date(f.dateEmission);
    const eKey = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}`;
    if (map.has(eKey)) map.get(eKey)!.ca += f.montant;

    f.paiements.forEach(p => {
      const pd = new Date(p.date);
      const pKey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(pKey)) map.get(pKey)!.encaisse += p.montant;
    });
  });

  return Array.from(map.values()).sort((a, b) => a.dateVal.getTime() - b.dateVal.getTime());
};

export const getBreakdowns = (factures: Facture[]) => {
  const byStatut = new Map<string, { count: number; amount: number }>();
  const byAssureur = new Map<string, number>();
  const byPraticien = new Map<string, number>();

  factures.forEach(f => {
    const st = byStatut.get(f.statut) || { count: 0, amount: 0 };
    st.count++;
    st.amount += f.montant;
    byStatut.set(f.statut, st);

    byAssureur.set(f.assureurId, (byAssureur.get(f.assureurId) || 0) + f.montant);
    byPraticien.set(f.praticienId, (byPraticien.get(f.praticienId) || 0) + f.montant);
  });

  return { byStatut, byAssureur, byPraticien };
};

export const getAgeingBuckets = (factures: Facture[]) => {
  const buckets = [
    { label: '0-30', min: 0, max: 30, amount: 0 },
    { label: '31-60', min: 31, max: 60, amount: 0 },
    { label: '61-90', min: 61, max: 90, amount: 0 },
    { label: '90+', min: 91, max: Infinity, amount: 0 },
  ];

  factures.forEach(f => {
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
    f.paiements.forEach(paiement => journal.push({ facture: f, paiement }));
  });
  return journal.sort((a, b) => new Date(b.paiement.date).getTime() - new Date(a.paiement.date).getTime());
};

export interface DebiteurInfo {
  patientNom: string;
  patientId: string;
  resteDu: number;
  nbFactures: number;
  retardMax: number;
  factures: Facture[];
}

export const getDebiteurs = (factures: Facture[]): DebiteurInfo[] => {
  const map = new Map<string, DebiteurInfo>();

  factures.forEach(f => {
    const reste = factureReste(f);
    if (reste <= 0) return;

    if (!map.has(f.patientId)) {
      map.set(f.patientId, { patientNom: f.patientNom, patientId: f.patientId, resteDu: 0, nbFactures: 0, retardMax: 0, factures: [] });
    }
    const info = map.get(f.patientId)!;
    info.resteDu += reste;
    info.nbFactures++;
    info.retardMax = Math.max(info.retardMax, joursRetard(f.dateEcheance));
    info.factures.push(f);
  });

  return Array.from(map.values()).sort((a, b) => b.resteDu - a.resteDu);
};

// Average days between billing and the final collection, over fully paid invoices.
export const getDSO = (factures: Facture[]) => {
  let sumDays = 0;
  let count = 0;

  factures.forEach(f => {
    if (f.statut !== 'payee' || f.paiements.length === 0) return;
    const start = new Date(f.dateEmission).getTime();
    const end = Math.max(...f.paiements.map(p => new Date(p.date).getTime()));
    sumDays += Math.max(0, (end - start) / 86400000);
    count++;
  });

  return { dso: count > 0 ? Math.round(sumDays / count) : null, count };
};
