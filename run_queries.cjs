const { execSync } = require('child_process');

const queries = [
  "npx supabase db query --linked \"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'visits' order by ordinal_position;\"",
  "npx supabase db query --linked \"select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.visits'::regclass;\"",
  "npx supabase db query --linked \"select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'payments' order by ordinal_position;\"",
  "npx supabase db query --linked \"select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.payments'::regclass;\"",
  "npx supabase db query --linked \"select pg_get_functiondef(oid) from pg_proc where proname = 'mm_next_queue_number' and pronamespace = 'public'::regnamespace;\"",
  "npx supabase db query --linked \"select policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename in ('visits', 'payments') and cmd in ('INSERT', 'ALL');\""
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
