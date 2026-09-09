/**
 * Applies db/schema.sql to Neon, then reports what actually exists afterwards.
 *
 * Run with:  npm run db:push
 *
 * This is the ONLY place DATABASE_URL is used. It is a direct superuser-ish
 * Postgres connection that BYPASSES RLS, which is exactly why the application
 * itself never touches it — the app talks to the Data API as the signed-in
 * user so that policies apply. Keep this script out of any request path.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    '\n✗ DATABASE_URL is not set.\n\n' +
      '  Copy .env.example to .env.local and paste your Neon connection string:\n' +
      '    cp .env.example .env.local\n'
  );
  process.exit(1);
}

const sql = readFileSync(join(root, 'db/schema.sql'), 'utf8');
const client = new pg.Client({ connectionString });

const row = (v) => (v === null || v === undefined ? '' : String(v));
function table(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => row(r[i]).length))
  );
  const line = (cells) =>
    '  ' + cells.map((c, i) => row(c).padEnd(widths[i])).join('  ');
  return [
    line(headers),
    '  ' + widths.map((w) => '-'.repeat(w)).join('  '),
    ...rows.map(line),
  ].join('\n');
}

try {
  await client.connect();
  console.log('→ Connected to Neon.');

  await client.query(sql);
  console.log('✓ db/schema.sql applied.\n');

  // ---- Table definition -------------------------------------------------
  const cols = await client.query(`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts'
    order by ordinal_position
  `);

  if (cols.rowCount === 0) {
    console.error('✗ Table public.contacts does not exist after apply.');
    process.exit(1);
  }

  console.log('TABLE public.contacts');
  console.log(
    table(
      ['COLUMN', 'TYPE', 'NULLABLE', 'DEFAULT'],
      cols.rows.map((r) => [
        r.column_name,
        r.data_type,
        r.is_nullable,
        r.column_default,
      ])
    )
  );

  // ---- CHECK constraints ------------------------------------------------
  const checks = await client.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.contacts'::regclass and contype = 'c'
    order by conname
  `);
  console.log('\nCHECK CONSTRAINTS');
  console.log(
    table(
      ['NAME', 'DEFINITION'],
      checks.rows.map((r) => [r.conname, r.def])
    )
  );

  // ---- RLS on/off -------------------------------------------------------
  const rls = await client.query(`
    select relrowsecurity from pg_class where oid = 'public.contacts'::regclass
  `);
  console.log(
    `\nROW LEVEL SECURITY: ${rls.rows[0].relrowsecurity ? 'ENABLED' : '*** DISABLED ***'}`
  );

  // ---- Policies ---------------------------------------------------------
  const policies = await client.query(`
    select policyname, cmd, roles::text as roles, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'contacts'
    order by cmd, policyname
  `);
  console.log(`\nACTIVE POLICIES (${policies.rowCount})`);
  console.log(
    table(
      ['POLICY', 'CMD', 'ROLES', 'USING', 'WITH CHECK'],
      policies.rows.map((r) => [
        r.policyname,
        r.cmd,
        r.roles,
        r.qual ?? '—',
        r.with_check ?? '—',
      ])
    )
  );

  const expected = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  const got = policies.rows.map((r) => r.cmd);
  const missing = expected.filter((c) => !got.includes(c));
  console.log(
    missing.length === 0
      ? '\n✓ All four ownership policies present.\n'
      : `\n✗ Missing policies for: ${missing.join(', ')}\n`
  );
} catch (err) {
  console.error('\n✗ Failed to apply schema:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
