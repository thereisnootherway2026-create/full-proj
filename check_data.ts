import { generateSeedData, factureNet, facturePaye, factureReste, Facture } from './src/components/facturation/data';
import { daysAgo } from './src/components/facturation/format';

const factures1 = generateSeedData();
const factures2 = generateSeedData();

console.log("=== DETERMINISM CHECK ===");
console.log("Lengths match?", factures1.length === factures2.length);
console.log("First invoice matches?", JSON.stringify(factures1[0]) === JSON.stringify(factures2[0]));
console.log("Last invoice matches?", JSON.stringify(factures1[factures1.length-1]) === JSON.stringify(factures2[factures2.length-1]));

console.log("\n=== INVOICE SPOT CHECKS ===");
const findAndCheck = (status: string) => {
  const f = factures1.find(x => x.statut === status);
  if (!f) return console.log(`No invoice with status ${status}`);
  const net = factureNet(f);
  const paye = facturePaye(f);
  const reste = factureReste(f);
  const sumPaiements = f.paiements.reduce((acc, p) => acc + p.montant, 0);
  console.log(`[${status}] FAC: ${f.numero}`);
  console.log(` - sum(paiements): ${sumPaiements} === facturePaye: ${paye} ?`, sumPaiements === paye);
  console.log(` - net (${net}) - paye (${paye}) = ${net - paye} === reste: ${reste} ?`, Math.abs((net - paye) - reste) < 0.01);
  console.log(` - echeance: ${f.dateEcheance}, today: ${new Date().toISOString()}`);
};
findAndCheck('payee');
findAndCheck('en_retard');
findAndCheck('partielle');

console.log("\n=== SANITY TOTALS (6 derniers mois) ===");
// window is 6 months ago to now
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

const factures6m = factures1.filter(f => new Date(f.dateEmission).getTime() >= sixMonthsAgo.getTime());
let caNet = 0;
let encaisse = 0;
let reste = 0;
let count = 0;

for (const f of factures6m) {
  if (f.statut === 'annulee' || f.statut === 'brouillon') continue;
  count++;
  caNet += factureNet(f);
  encaisse += facturePaye(f);
  reste += factureReste(f);
}

const panierMoyen = count > 0 ? caNet / count : 0;

console.log("Factures count:", count, "(Expected ~193)");
console.log("CA Net:", caNet.toFixed(2), "(Expected ~133,299)");
console.log("Encaissé:", encaisse.toFixed(2), "(Expected ~91,499)");
console.log("Reste:", reste.toFixed(2), "(Expected ~41,800)");
console.log("Panier moyen:", panierMoyen.toFixed(2), "(Expected ~691)");
