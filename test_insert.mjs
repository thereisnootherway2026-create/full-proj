import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mdercwnxdfogbymkoosu.supabase.co', 'sb_publishable_nuVHtbOv_eNBAuyqixbn0A_KTZFcvKb');

async function run() {
  const email = `test_ai_${Date.now()}@example.com`;
  const password = 'password123';
  
  const { data: authData } = await supabase.auth.signUp({ email, password });
  
  const payload = {
    patient_id: '00000000-0000-0000-0000-000000000000',
    cabinet_id: '00000000-0000-0000-0000-000000000000',
    date_consult: new Date().toISOString(),
    statut: 'paye',
    montant: 300,
    notes: 'Test insert',
  };
  
  const { data, error } = await supabase.from('consultations').insert(payload).select();
  
  if (error) {
    console.error('InvoiceForm submit error - full object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('InvoiceForm submit error - raw:', error);
  } else {
    console.log("Insert successful:", data);
  }
}

run().catch(console.error);
