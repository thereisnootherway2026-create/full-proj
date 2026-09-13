const { execSync } = require('child_process');

const queries = [
  "npx supabase db query --linked \"select table_name from information_schema.tables where table_schema = 'public' and (table_name ilike '%acte%' or table_name ilike '%catalogue%' or table_name ilike '%nomenclature%' or table_name ilike '%tarif%' or table_name ilike '%prestation%');\"",
  "npx supabase db query --linked \"select table_name from information_schema.tables where table_schema = 'public' and (table_name ilike '%ligne%' or table_name ilike '%line_item%' or table_name ilike '%invoice_item%');\"",
  "npx supabase db query --linked \"select table_name, column_name from information_schema.columns where table_schema = 'public' and (column_name ilike '%echeance%' or column_name ilike '%due_date%') ;\"",
  "npx supabase db query --linked \"select id, nom_complet, role, status from public.profiles where role in ('doctor','docteur','medecin','médecin');\""
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
