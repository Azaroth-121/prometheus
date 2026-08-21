import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import { profiles, promptConfigs, type Database } from '@prometheus/database';
import { getActivePromptConfig } from './config';

/**
 * Same real-Postgres-via-Testcontainers approach as
 * packages/billing/src/access.test.ts -- the partial unique index this test
 * relies on (prompt_configs_one_published_per_name) is real DDL, not
 * something a mocked query builder would ever catch a violation of.
 */
describe('prompt config registry', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    const dir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(dir, '..', '..', 'database', 'drizzle');
    const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    for (const file of migrationFiles) {
      await client.query(readFileSync(join(migrationsDir, file), 'utf-8'));
    }
    await client.end();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // Migration 0002 seeds three published rows -- clear them so each test
    // starts from a known, empty slate instead of the real seed data.
    await db.execute(sql`TRUNCATE prompt_configs, profiles CASCADE`);
  });

  async function seedAdmin() {
    const [admin] = await db
      .insert(profiles)
      .values({
        email: `admin-${crypto.randomUUID()}@example.com`,
        passwordHash: 'hash',
        role: 'admin',
      })
      .returning({ id: profiles.id });
    return admin!.id;
  }

  it('returns the published row for a mode', async () => {
    const adminId = await seedAdmin();
    await db.insert(promptConfigs).values({
      name: 'standard',
      version: 'v1.0',
      systemPrompt: 'the live prompt',
      model: 'gpt-4o-mini',
      status: 'published',
      createdBy: adminId,
    });

    const config = await getActivePromptConfig(db, 'standard');

    expect(config?.systemPrompt).toBe('the live prompt');
    expect(config?.version).toBe('v1.0');
  });

  it('excludes draft and archived rows for the same mode', async () => {
    const adminId = await seedAdmin();
    await db.insert(promptConfigs).values([
      { name: 'standard', version: 'v0.9', systemPrompt: 'old', model: 'gpt-4o-mini', status: 'archived', createdBy: adminId },
      { name: 'standard', version: 'v1.1', systemPrompt: 'not yet', model: 'gpt-4o-mini', status: 'draft', createdBy: adminId },
    ]);

    const config = await getActivePromptConfig(db, 'standard');

    expect(config).toBeUndefined();
  });

  it('returns undefined when no row exists for a mode at all', async () => {
    const config = await getActivePromptConfig(db, 'image');

    expect(config).toBeUndefined();
  });

  it('reflects a publish/archive swap on the next read', async () => {
    const adminId = await seedAdmin();
    const [oldRow] = await db
      .insert(promptConfigs)
      .values({ name: 'code', version: 'v1.0', systemPrompt: 'old code prompt', model: 'gpt-4o-mini', status: 'published', createdBy: adminId })
      .returning({ id: promptConfigs.id });
    const [newRow] = await db
      .insert(promptConfigs)
      .values({ name: 'code', version: 'v1.1', systemPrompt: 'new code prompt', model: 'gpt-4o-mini', status: 'draft', createdBy: adminId })
      .returning({ id: promptConfigs.id });

    await db.transaction(async (tx) => {
      await tx.update(promptConfigs).set({ status: 'archived' }).where(eq(promptConfigs.id, oldRow!.id));
      await tx.update(promptConfigs).set({ status: 'published', publishedAt: new Date() }).where(eq(promptConfigs.id, newRow!.id));
    });

    const config = await getActivePromptConfig(db, 'code');

    expect(config?.systemPrompt).toBe('new code prompt');
    expect(config?.version).toBe('v1.1');
  });

  it('rejects a second simultaneously published row for the same name via the partial unique index', async () => {
    const adminId = await seedAdmin();
    await db.insert(promptConfigs).values({
      name: 'image',
      version: 'v1.0',
      systemPrompt: 'first',
      model: 'gpt-4o-mini',
      status: 'published',
      createdBy: adminId,
    });

    await expect(
      db.insert(promptConfigs).values({
        name: 'image',
        version: 'v1.1',
        systemPrompt: 'second, published without archiving the first',
        model: 'gpt-4o-mini',
        status: 'published',
        createdBy: adminId,
      })
    ).rejects.toThrow();
  });
});
