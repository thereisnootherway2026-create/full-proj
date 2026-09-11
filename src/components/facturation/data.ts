import { nowIso, daysAgo } from './format';

export type Statut = 'payee' | 'partielle' | 'en_attente' | 'en_retard' | 'annulee' | 'brouillon';
export type Mode = 'Especes' | 'Carte' | 'Cheque' | 'Virement' | 'Tiers payant';

export interface Acte { code: string; libelle: string; categorie: string; pu: number; }
export interface Ligne { code: string; libelle: string; qte: number; pu: number; }
export interface Paiement { id: string; date: string; montant: number; mode: Mode; }
export interface Assureur { id: string; label: string; taux: number; couleur: string; }
export interface Praticien { id: string; nom: string; specialite: string; couleur: string; }
export interface Facture {
  id: string;
  numero: string;
  dateEmission: string;
  dateEcheance: string;
  praticienId: string;
  patientNom: string;
  patientRef: string;
  assureurId: string;
  lignes: Ligne[];
  remise: number;
  statut: Statut;
  paiements: Paiement[];
  brouillon?: boolean;
  relance?: boolean;
}

export const praticiens: Praticien[] = [
  { id: 'p1', nom: 'Dr. Azrf Dsf', specialite: 'Médecine générale', couleur: '#2563eb' },
  { id: 'p2', nom: 'Dr. Nadia Safi', specialite: 'Cardiologue', couleur: '#7c3aed' },
  { id: 'p3', nom: 'Dr. Omar Bennani', specialite: 'Pédiatre', couleur: '#0891b2' },
  { id: 'p4', nom: 'Dr. Leila Haddad', specialite: 'Gynécologue', couleur: '#db2777' },
  { id: 'p5', nom: 'Dr. Samir Tazi', specialite: 'Dermatologue', couleur: '#16a34a' }
];

export const assureurs: Assureur[] = [
  { id: 'a1', label: 'CNSS/CNOPS', taux: 0.8, couleur: '#2563eb' },
  { id: 'a2', label: 'AMO', taux: 0.7, couleur: '#0ea5e9' },
  { id: 'a3', label: 'Mutuelle privée', taux: 0.6, couleur: '#7c3aed' },
  { id: 'a4', label: 'Sans assurance', taux: 0, couleur: '#94a3b8' },
  { id: 'a5', label: 'Tiers payant', taux: 1, couleur: '#16a34a' }
];

export const actesCatalogue: Acte[] = [
  { code: 'CS', libelle: 'Consultation générale', pu: 250, categorie: 'Consultations' },
  { code: 'CSP', libelle: 'Consultation spécialisée', pu: 400, categorie: 'Consultations' },
  { code: 'CSU', libelle: "Consultation d'urgence", pu: 450, categorie: 'Consultations' },
  { code: 'CVC', libelle: 'Contrôle/suivi', pu: 150, categorie: 'Consultations' },
  { code: 'ECG', libelle: 'Électrocardiogramme', pu: 300, categorie: 'Imagerie' },
  { code: 'ECHO', libelle: 'Échographie', pu: 500, categorie: 'Imagerie' },
  { code: 'RAD', libelle: 'Radiographie', pu: 250, categorie: 'Imagerie' },
  { code: 'BIO', libelle: 'Bilan biologique', pu: 600, categorie: 'Biologie' },
  { code: 'NFG', libelle: 'NFS/Glycémie', pu: 180, categorie: 'Biologie' },
  { code: 'PBI', libelle: 'Petite chirurgie', pu: 700, categorie: 'Petite chirurgie' },
  { code: 'SDS', libelle: 'Suture de plaie', pu: 350, categorie: 'Petite chirurgie' },
  { code: 'IG', libelle: 'Injection/perfusion', pu: 120, categorie: 'Soins' },
  { code: 'VD', libelle: 'Vaccin (dose)', pu: 200, categorie: 'Soins' },
  { code: 'CNT', libelle: 'Certificat médical', pu: 150, categorie: 'Divers' }
];

const patientNames = [
  'Elbachir Ilyas', 'Bouazza Karim', 'Chraibi Salma', 'El Amrani Youssef',
  'Benkirane Fatima', 'Tazi Meryem', 'Sefrioui Adil', 'Berrada Sofia',
  'El Fassi Hamid', 'Ouali Nabil', 'Alaoui Rania', 'Zniber Mehdi',
  'Bennis Hicham', 'Mennane Khalid', 'Tahiri Laila', 'Chafik Amina',
  'Filali Yassine', 'Naciri Othmane'
];

export const patientsPool = patientNames.map((nom, i) => ({
  nom,
  ref: `P-2024-${String(i + 1).padStart(4, '0')}`
}));

export const cabinet = {
  nom: 'MacroMedica',
  objectifMensuel: 140000,
  benchmarkRecouvrement: 85
};

// Money helpers
export const ligneTotal = (l: Ligne) => l.pu * l.qte;
export const factureHT = (f: Pick<Facture, 'lignes'|'remise'>) => {
  const sum = f.lignes.reduce((acc, l) => acc + ligneTotal(l), 0);
  return sum * (1 - (f.remise / 100));
};
export const factureTVA = (f: Pick<Facture, 'lignes'|'remise'>) => factureHT(f) * 0.20;
export const factureNet = (f: Pick<Facture, 'lignes'|'remise'>) => factureHT(f) + factureTVA(f);
export const facturePaye = (f: Pick<Facture, 'paiements'>) => f.paiements.reduce((acc, p) => acc + p.montant, 0);
export const factureReste = (f: Pick<Facture, 'lignes'|'remise'|'paiements'>) => Math.max(0, factureNet(f) - facturePaye(f));

// PRNG Generator (mulberry32)
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export function generateSeedData(): Facture[] {
  const prng = mulberry32(42);
  const factures: Facture[] = [];
  
  // 8 months of data (~240 days)
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - 240);
  
  const modes: Mode[] = ['Especes', 'Carte', 'Cheque', 'Virement', 'Tiers payant'];
  const remises = [0, 0, 0, 0, 0, 5, 10]; // mostly 0
  
  for (let i = 1; i <= 195; i++) {
    const emissionMs = start.getTime() + prng() * (now.getTime() - start.getTime());
    const emissionDate = new Date(emissionMs);
    const echeanceDate = new Date(emissionMs + 30 * 86400000);
    
    const praticien = praticiens[Math.floor(prng() * praticiens.length)];
    const assureur = assureurs[Math.floor(prng() * assureurs.length)];
    const patient = patientsPool[Math.floor(prng() * patientsPool.length)];
    
    // 1 to 4 lignes
    const nbLignes = Math.floor(prng() * 4) + 1;
    const lignes: Ligne[] = [];
    for (let j = 0; j < nbLignes; j++) {
      const acte = actesCatalogue[Math.floor(prng() * actesCatalogue.length)];
      lignes.push({
        code: acte.code,
        libelle: acte.libelle,
        pu: acte.pu,
        qte: Math.floor(prng() * 2) + 1
      });
    }
    
    const remise = remises[Math.floor(prng() * remises.length)];
    
    let f: Facture = {
      id: `f-${i}`,
      numero: `FAC-${String(i).padStart(4, '0')}`,
      dateEmission: emissionDate.toISOString(),
      dateEcheance: echeanceDate.toISOString(),
      praticienId: praticien.id,
      patientNom: patient.nom,
      patientRef: patient.ref,
      assureurId: assureur.id,
      lignes,
      remise,
      statut: 'brouillon',
      paiements: []
    };
    
    const isDraft = prng() < 0.05;
    const isCancelled = prng() < 0.05;
    
    if (isDraft) {
      f.brouillon = true;
      f.statut = 'brouillon';
    } else if (isCancelled) {
      f.statut = 'annulee';
    } else {
      // payment logic
      const net = factureNet(f);
      const isPaidFull = prng() < 0.75; // 75% full paid
      const isPaidPartial = !isPaidFull && prng() < 0.3;
      
      if (isPaidFull || isPaidPartial) {
        const payAmount = isPaidFull ? net : Math.floor(net * (prng() * 0.5 + 0.2));
        const pDate = new Date(emissionMs + prng() * 20 * 86400000);
        f.paiements.push({
          id: `p-${i}-1`,
          date: pDate.toISOString(),
          montant: payAmount,
          mode: modes[Math.floor(prng() * modes.length)]
        });
        f.statut = isPaidFull ? 'payee' : 'partielle';
      }
      
      // Compute correct status if not fully paid
      if (factureReste(f) > 0.01 && !isDraft && !isCancelled) {
        if (now.getTime() > echeanceDate.getTime()) {
          f.statut = 'en_retard';
          f.relance = prng() > 0.5;
        } else {
          f.statut = f.paiements.length > 0 ? 'partielle' : 'en_attente';
        }
      }
    }
    
    factures.push(f);
  }
  
  // Sort by date emission desc
  return factures.sort((a, b) => new Date(b.dateEmission).getTime() - new Date(a.dateEmission).getTime());
}
