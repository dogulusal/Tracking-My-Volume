// Runs supabase/tests/coach_mode_check.sql against the linked project with
// the coach migration in place, inside one transaction that is rolled back:
// nothing it creates stays. Prints each check and fails if any is not ok.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const migration = readFileSync(path.join(root, 'supabase/migrations/20261004120000_coach_mode.sql'), 'utf8');
const check = readFileSync(path.join(root, 'supabase/tests/coach_mode_check.sql'), 'utf8');
// A function, not a string: a replacement string would read the migration's $$ as a pattern.
const sql = check.replace('-- @@MIGRATION@@', () => migration);
const file = path.join(mkdtempSync(path.join(tmpdir(), 'coach-check-')), 'check.sql');
writeFileSync(file, sql);

const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], { cwd: process.env.SUPABASE_WORKDIR ?? root, encoding: 'utf8', maxBuffer: 1 << 24 });
const json = JSON.parse(out.slice(out.indexOf('{')));
let failed = 0;
for (const row of json.rows) {
  if (!row.ok) failed++;
  console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.name}  (${row.detail})`);
}
console.log(`${json.rows.length - failed}/${json.rows.length} ok`);
process.exit(failed || json.rows.length === 0 ? 1 : 0);
