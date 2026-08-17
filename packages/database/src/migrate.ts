import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

/**
 * Applies drizzle/0000_init.sql directly via the `pg` driver -- avoids
 * assuming the `psql` CLI is installed locally, since `pg` is already a
 * dependency of this package either way. Fine as a one-shot for a fresh
 * database (there's no data to preserve, per the migration decision); a
 * real incremental-migration runner (drizzle-kit migrate) is the right tool
 * once this needs to run against a database that already has data in it.
 *
 * Usage: DATABASE_URL=postgres://... pnpm --filter @prometheus/database exec tsx src/migrate.ts
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const dir = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(dir, '..', 'drizzle', '0000_init.sql'), 'utf-8');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Schema applied.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
