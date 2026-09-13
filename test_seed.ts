import { generateSeedData, factureNet, facturePaye } from './src/components/facturation/data.ts';
import { getTotals } from './src/components/facturation/selectors.ts';

const factures = generateSeedData();

// Simulate filter '6m'
const now = new Date();
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(now.getMonth() - 6);

const filtered = factures.filter(f => {
  const d = new Date(f.dateEmission);
  return d >= sixMonthsAgo && d <= now;
});

const totals = getTotals(filtered);
console.log('--- 6 MOIS ---');
console.log('Factures count:', totals.count);
console.log('CA Net:', totals.caNet);
console.log('Encaisse:', totals.totalEncaisse);
console.log('Reste:', totals.resteAEncaisser);
console.log('Panier:', totals.panierMoyen);
console.log('Recovery %:', totals.tauxRecouvrement * 100);
console.log('Late Total:', totals.enRetardAmount);

// Check invariants
let allValid = true;
factures.forEach(f => {
  const net = factureNet(f);
  const paye = facturePaye(f);
  if (Math.abs(paye - f.paiements.reduce((a,p)=>a+p.montant,0)) > 0.01) allValid = false;
  if (f.statut === 'payee' && net - paye > 0.01) allValid = false;
});
console.log('Invariants OK:', allValid);
