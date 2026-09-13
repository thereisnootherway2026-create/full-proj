import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://mdercwnxdfogbymkoosu.supabase.co', 'sb_publishable_nuVHtbOv_eNBAuyqixbn0A_KTZFcvKb');
async function run() {
  const { data, error } = await supabase.from('consultations').select('statut');
  if (error) { console.error(error); return; }
  const counts = {};
  for (const row of data) { counts[row.statut] = (counts[row.statut] || 0) + 1; }
  console.log("Legacy Statut Counts:", counts);
}
run();
