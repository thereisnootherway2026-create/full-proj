const { execSync } = require('child_process');

const queries = [
  "npx supabase db query --linked \"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'visits' order by ordinal_position;\"",
  "npx supabase db query --linked \"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'consultations' order by ordinal_position;\"",
  "npx supabase db query --linked \"select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.consultations'::regclass;\""
];

for (let i = 0; i < queries.length; i++) {
  console.log(`\n=== QUERY ${i + 1} ===`);
  try {
    const stdout = execSync(queries[i], { stdio: 'pipe', maxBuffer: 1024 * 1024 }).toString();
    console.log(stdout);
  } catch (err) {
    console.log("ERROR:");
    console.log(err.stdout ? err.stdout.toString() : err.message);
  }
}
