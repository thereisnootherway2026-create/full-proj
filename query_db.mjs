import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mdercwnxdfogbymkoosu.supabase.co', 'sb_publishable_nuVHtbOv_eNBAuyqixbn0A_KTZFcvKb');

async function run() {
  console.log("=== COUNT QUERY ===");
  const { count: countTotal } = await supabase.from('consultations').select('*', { count: 'exact', head: true });
  const { count: countMontant } = await supabase.from('consultations').select('montant', { count: 'exact', head: true }).not('montant', 'is', null);
  const { count: countMontantEncaisse } = await supabase.from('consultations').select('montant_encaisse', { count: 'exact', head: true }).not('montant_encaisse', 'is', null);
  const { count: countPaymentStatus } = await supabase.from('consultations').select('payment_status', { count: 'exact', head: true }).not('payment_status', 'is', null);
  console.log({ countTotal, countMontant, countMontantEncaisse, countPaymentStatus });

  console.log("\n=== ECHEANCE/DUE COLUMNS ===");
  const { data: cols } = await supabase.from('consultations').select('*').limit(1);
  if (cols && cols.length > 0) {
    const keys = Object.keys(cols[0]);
    console.log("Consultations columns:", keys);
    const dateCols = keys.filter(k => k.toLowerCase().includes('echeance') || k.toLowerCase().includes('due') || k.toLowerCase().includes('date'));
    console.log("Date/Echeance/Due matching columns:", dateCols);
  }

  console.log("\n=== PATIENT_ID CHECK ===");
  const { count: countPatientId } = await supabase.from('consultations').select('patient_id', { count: 'exact', head: true }).not('patient_id', 'is', null);
  console.log({ countPatientId, countTotal });
  
  // Outstanding balances (Debiteurs)
  const { data: debiteurs } = await supabase.from('consultations')
    .select('patient_id, payment_status, montant, montant_encaisse')
    .neq('payment_status', 'paid')
    .limit(5);
  console.log("Debiteurs sample:", debiteurs);
}

run().catch(console.error);
