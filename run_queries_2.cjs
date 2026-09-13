const { execSync } = require('child_process');

const queries = [
  "npx supabase db query --linked \"select proname from pg_proc where (proname ilike '%invoice%' or proname ilike '%manual%' or proname ilike '%standalone%' or proname ilike '%record_payment%' or proname ilike '%billing%') and pronamespace = 'public'::regnamespace;\"",
  "npx supabase db query --linked \"select column_name from information_schema.columns where table_schema = 'public' and table_name = 'payments' order by ordinal_position;\"",
  "npx supabase db query --linked \"select table_name from information_schema.tables where table_schema = 'public' and table_name ilike '%cheque%';\""
];

for (let i = 0; i < queries.length; i++) {
  console.log(`\n=== QUERY ${i + 1} ===`);
  try {
    const stdout = execSync(queries[i], { stdio: 'pipe' }).toString();
    console.log(stdout);
  } catch (err) {
    console.log("ERROR:");
    console.log(err.stdout ? err.stdout.toString() : err.message);
  }
}
