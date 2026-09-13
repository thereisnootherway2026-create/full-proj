import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mdercwnxdfogbymkoosu.supabase.co', 'sb_publishable_nuVHtbOv_eNBAuyqixbn0A_KTZFcvKb');

async function run() {
  console.log("=== COUNT PAYMENTS ===");
  const { count: countTotal } = await supabase.from('payments').select('*', { count: 'exact', head: true });
  console.log({ paymentsCountTotal: countTotal });
}

run().catch(console.error);
