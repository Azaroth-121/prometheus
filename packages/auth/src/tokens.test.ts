import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import { profiles, refreshTokens, type Database } from '@prometheus/database';
import { issueRefreshToken, revokeAllRefreshTokensForUser, revokeRefreshToken, verifyRefreshToken } from './tokens';

const SECRET = 'test-secret';

/** Same real-Postgres-via-Testcontainers approach as packages/prompts/src/config.test.ts. */
describe('refresh token revocation', () => {
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
    await db.execute(sql`TRUNCATE refresh_tokens, profiles CASCADE`);
  });

  async function seedUser() {
    const [user] = await db
      .insert(profiles)
      .values({ email: `user-${crypto.randomUUID()}@example.com`, passwordHash: 'hash' })
      .returning({ id: profiles.id });
    return user!.id;
  }

  it('issues a refresh token that verifies back to the same user', async () => {
    const userId = await seedUser();

    const token = await issueRefreshToken(db, userId, SECRET);
    const verified = await verifyRefreshToken(db, token, SECRET);

    expect(verified).toBe(userId);
  });

  it('updates lastUsedAt on a successful verify', async () => {
    const userId = await seedUser();
    const token = await issueRefreshToken(db, userId, SECRET);

    await verifyRefreshToken(db, token, SECRET);

    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it('a revoked token fails verification even though the JWT itself is still validly signed and unexpired', async () => {
    const userId = await seedUser();
    const token = await issueRefreshToken(db, userId, SECRET);

    const revoked = await revokeRefreshToken(db, token, SECRET);
    expect(revoked).toBe(true);

    const verified = await verifyRefreshToken(db, token, SECRET);
    expect(verified).toBeNull();
  });

  it('revoking twice returns false the second time (nothing left to revoke)', async () => {
    const userId = await seedUser();
    const token = await issueRefreshToken(db, userId, SECRET);

    expect(await revokeRefreshToken(db, token, SECRET)).toBe(true);
    expect(await revokeRefreshToken(db, token, SECRET)).toBe(false);
  });

  it('revokeAllRefreshTokensForUser revokes every live token for that user and none of another user\'s', async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const tokenA = await issueRefreshToken(db, userId, SECRET);
    const tokenB = await issueRefreshToken(db, userId, SECRET);
    const otherToken = await issueRefreshToken(db, otherUserId, SECRET);

    const count = await revokeAllRefreshTokensForUser(db, userId, 'admin_suspended_account');

    expect(count).toBe(2);
    expect(await verifyRefreshToken(db, tokenA, SECRET)).toBeNull();
    expect(await verifyRefreshToken(db, tokenB, SECRET)).toBeNull();
    expect(await verifyRefreshToken(db, otherToken, SECRET)).toBe(otherUserId);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const userId = await seedUser();
    const token = await issueRefreshToken(db, userId, SECRET);

    const verified = await verifyRefreshToken(db, token, 'a-different-secret');

    expect(verified).toBeNull();
  });
});
