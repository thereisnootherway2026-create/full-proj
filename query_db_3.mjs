import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mdercwnxdfogbymkoosu.supabase.co', 'sb_publishable_nuVHtbOv_eNBAuyqixbn0A_KTZFcvKb');

async function run() {
  const { data, error } = await supabase.from('pg_policies').select('*').eq('tablename', 'consultations');
  console.log("Policies:", data, error);
}

run().catch(console.error);
