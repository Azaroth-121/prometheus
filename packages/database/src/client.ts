import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/**
 * Single Postgres client factory. Replaces the old three-Supabase-client
 * split (browser/server/service-role) -- there's no more RLS-vs-service-role
 * distinction to model, since authorization now happens entirely in
 * application code (see packages/auth). Safe to call once per process and
 * reuse: this app runs as a long-lived Container App, not serverless
 * functions, so a single pooled connection is the right shape (no
 * per-invocation connection churn to worry about, unlike Vercel).
 *
 * SECURITY: this connection can read/write every table with no row-level
 * restriction. Every caller is responsible for its own authorization check
 * (requireRole/requireAdmin from @prometheus/auth, or an explicit
 * `where(eq(profiles.id, userId))`) before querying -- there is no database-
 * level backstop anymore.
 */
export function createDatabaseClient(connectionString: string): Database {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export * from './schema';
