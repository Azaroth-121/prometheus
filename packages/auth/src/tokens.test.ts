import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import { profiles, refreshTokens, type Database } from '@prometheus/database';
import {
  issueRefreshToken,
  ROTATION_GRACE_SECONDS,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyRefreshToken,
} from './tokens';

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

  /** Moves this user's rotated tokens' revokedAt to before the grace window, so a replay counts as theft. */
  async function backdateRotation(userId: string) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(Date.now() - (ROTATION_GRACE_SECONDS + 60) * 1000) })
      .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.revokedReason, 'rotated')));
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

  describe('rotation and reuse detection', () => {
    it('rotating a valid token returns a usable replacement and revokes the original', async () => {
      const userId = await seedUser();
      const token = await issueRefreshToken(db, userId, SECRET);

      const rotated = await rotateRefreshToken(db, token, SECRET);

      expect(rotated?.userId).toBe(userId);
      expect(rotated?.refreshToken).not.toBe(token);

      // Two rows now exist (original + replacement); the original is the one
      // with a revokedReason of 'rotated'.
      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.revokedReason === 'rotated')).toBeTruthy();

      // The replacement itself verifies and can be rotated again.
      const rotatedAgain = await rotateRefreshToken(db, rotated!.refreshToken, SECRET);
      expect(rotatedAgain?.userId).toBe(userId);
    });

    it('the same family_id is preserved across a rotation', async () => {
      const userId = await seedUser();
      const token = await issueRefreshToken(db, userId, SECRET);
      const [original] = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));

      const rotated = await rotateRefreshToken(db, token, SECRET);
      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));
      const replacement = rows.find((r) => r.revokedReason !== 'rotated');

      expect(rotated).not.toBeNull();
      expect(replacement?.familyId).toBe(original?.familyId);
    });

    it('rotating an already-rotated token fails and does not mint another replacement', async () => {
      const userId = await seedUser();
      const token = await issueRefreshToken(db, userId, SECRET);
      await rotateRefreshToken(db, token, SECRET);

      const secondAttempt = await rotateRefreshToken(db, token, SECRET);

      expect(secondAttempt).toBeNull();
    });

    it('reusing an already-rotated token revokes the whole family -- the replacement stops working too', async () => {
      const userId = await seedUser();
      const original = await issueRefreshToken(db, userId, SECRET);
      const rotatedOnce = await rotateRefreshToken(db, original, SECRET);
      expect(rotatedOnce).not.toBeNull();

      // The replacement is live right now.
      const stillGoodBeforeReplay = await verifyRefreshToken(db, rotatedOnce!.refreshToken, SECRET);
      expect(stillGoodBeforeReplay).toBe(userId);

      // Someone replays the original, already-rotated token after the grace
      // window has passed -- the theft signal.
      await backdateRotation(userId);
      const replayResult = await rotateRefreshToken(db, original, SECRET);
      expect(replayResult).toBeNull();

      // The whole family, including the not-otherwise-compromised replacement, is now dead.
      const replacementAfterReplay = await verifyRefreshToken(db, rotatedOnce!.refreshToken, SECRET);
      expect(replacementAfterReplay).toBeNull();

      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
      expect(rows.find((r) => r.revokedReason === 'reuse_detected')).toBeTruthy();
    });

    it('rotation is scoped per family -- revoking one user\'s family never touches another user\'s tokens', async () => {
      const userId = await seedUser();
      const otherUserId = await seedUser();
      const token = await issueRefreshToken(db, userId, SECRET);
      const otherToken = await issueRefreshToken(db, otherUserId, SECRET);

      await rotateRefreshToken(db, token, SECRET);
      await backdateRotation(userId);
      await rotateRefreshToken(db, token, SECRET); // triggers reuse detection on userId's family only

      expect(await verifyRefreshToken(db, otherToken, SECRET)).toBe(otherUserId);
    });

    it('a replay inside the grace window is refused but does not revoke the family (popup and background racing)', async () => {
      const userId = await seedUser();
      const original = await issueRefreshToken(db, userId, SECRET);
      const rotatedOnce = await rotateRefreshToken(db, original, SECRET);
      expect(rotatedOnce).not.toBeNull();

      const racingSecondCall = await rotateRefreshToken(db, original, SECRET);
      expect(racingSecondCall).toBeNull();

      // The winner's replacement keeps working, and nothing was marked as reuse.
      expect(await verifyRefreshToken(db, rotatedOnce!.refreshToken, SECRET)).toBe(userId);
      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));
      expect(rows.find((r) => r.revokedReason === 'reuse_detected')).toBeUndefined();
    });

    it('two simultaneous rotations of the same token mint at most one replacement and never revoke the family', async () => {
      const userId = await seedUser();
      const original = await issueRefreshToken(db, userId, SECRET);

      const results = await Promise.all([
        rotateRefreshToken(db, original, SECRET),
        rotateRefreshToken(db, original, SECRET),
      ]);
      const winners = results.filter((r) => r !== null);
      expect(winners).toHaveLength(1);

      expect(await verifyRefreshToken(db, winners[0]!.refreshToken, SECRET)).toBe(userId);
      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));
      expect(rows.find((r) => r.revokedReason === 'reuse_detected')).toBeUndefined();
    });
  });
});
