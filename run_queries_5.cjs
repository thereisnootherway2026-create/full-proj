const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log(`\n=== 1. DB Query: supabase_migrations.schema_migrations ===`);
try {
  const q = `npx supabase db query --linked "select version, name from supabase_migrations.schema_migrations where version in ('20260902000000','20260911000000','20260911010000','20260911020000') order by version;"`;
  console.log(execSync(q, { stdio: 'pipe', maxBuffer: 1024 * 1024 }).toString());
} catch (err) {
  console.log("ERROR:");
  console.log(err.stdout ? err.stdout.toString() : err.message);
}

console.log(`\n=== 2. Local Files ===`);
const migDir = path.join('supabase', 'migrations');
let files = [];
try {
  files = fs.readdirSync(migDir).filter(f =>
    f.includes('20260902000000') ||
    f.includes('20260911000000') ||
    f.includes('20260911010000') ||
    f.includes('20260911020000')
  );
  console.log("Matched files:\n" + files.join('\n'));
} catch(err) {
  console.log("Error reading directory:", err);
}

for (const file of files) {
  console.log(`\n\n--- File: ${file} ---`);
  try {
    console.log(fs.readFileSync(path.join(migDir, file), 'utf8'));
  } catch(err) {
    console.log("Error reading file:", err);
  }
}
