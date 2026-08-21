import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

/**
 * Applies one file from drizzle/ directly via the `pg` driver -- avoids
 * assuming the `psql` CLI is installed locally, since `pg` is already a
 * dependency of this package either way. Defaults to 0000_init.sql (the
 * fresh-database bootstrap); pass a specific filename to apply a later
 * incremental migration instead. Each invocation applies exactly one file --
 * there's no tracking of which migrations have already run (no journal, no
 * drizzle-kit `migrate()`), so re-running the same file against a database
 * that already has it applied will fail on the now-duplicate DDL. A real
 * incremental-migration runner is the right tool once this needs more than
 * the occasional hand-applied ALTER TABLE.
 *
 * Usage: DATABASE_URL=postgres://... pnpm --filter @prometheus/database exec tsx src/migrate.ts [filename]
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const filename = process.argv[2] ?? '0000_init.sql';
  const dir = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(dir, '..', 'drizzle', filename), 'utf-8');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied ${filename}.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
