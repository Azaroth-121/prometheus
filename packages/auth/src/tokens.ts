import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { refreshTokens } from '@prometheus/database';

/**
 * Self-issued bearer tokens for the browser extension -- replaces Supabase's
 * anon-key + GoTrue access/refresh token pair. The extension's popup
 * exchanges email+password for this pair once (via POST /api/v1/auth/token
 * in apps/web), then background.ts refreshes the access token as needed via
 * POST /api/v1/auth/refresh, storing both in chrome.storage.local -- same
 * storage mechanism as before, different token format and refresh endpoint.
 *
 * Deliberately NOT reusing NextAuth's own session token: NextAuth's
 * Credentials-provider JWTs are designed to live in an httpOnly cookie for
 * the web app, not to be read/sent manually by extension code. Issuing a
 * separate, purpose-built token pair keeps the extension's auth surface
 * simple and independent of NextAuth's cookie-based session internals.
 *
 * Refresh tokens are revocable even though they're JWTs: the `jti` claim
 * points at a `refresh_tokens` row, and that row -- not the JWT signature
 * alone -- is authoritative on validity. A stateless JWT can never be
 * un-issued once signed, so revocation has to live in the database; access
 * tokens stay purely stateless (no DB check) since their 15-minute TTL is
 * already the acceptable worst-case exposure window after a revoke.
 */

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AccessTokenPayload {
  sub: string; // profile id
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string; // refresh_tokens.id
}

export function issueAccessToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, type: 'access' } satisfies AccessTokenPayload, secret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export async function issueRefreshToken(db: Database, userId: string, secret: string): Promise<string> {
  // Generated up front (rather than left to the column default) so this
  // fresh token can be its own family's root: familyId = id. Every later
  // rotation of it inherits this same familyId -- see rotateRefreshToken.
  const id = randomUUID();
  const [row] = await db
    .insert(refreshTokens)
    .values({
      id,
      familyId: id,
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    })
    .returning({ id: refreshTokens.id });

  if (!row) {
    throw new Error('Failed to issue a refresh token.');
  }

  return jwt.sign({ sub: userId, type: 'refresh', jti: row.id } satisfies RefreshTokenPayload, secret, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });
}

/** Returns the profile id if the access token is valid and unexpired, else null. */
export function verifyAccessToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret) as AccessTokenPayload;
    if (payload.type !== 'access') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function decodeRefreshToken(token: string, secret: string): RefreshTokenPayload | null {
  try {
    const payload = jwt.verify(token, secret) as RefreshTokenPayload;
    if (payload.type !== 'refresh' || !payload.jti) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Returns the profile id if the refresh token's signature/expiry are valid
 * AND its backing row exists and hasn't been revoked -- the row is checked
 * on every call, so a revoke takes effect on the very next refresh attempt.
 */
export async function verifyRefreshToken(db: Database, token: string, secret: string): Promise<string | null> {
  const payload = decodeRefreshToken(token, secret);
  if (!payload) return null;

  const [row] = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.id, payload.jti), eq(refreshTokens.userId, payload.sub), isNull(refreshTokens.revokedAt)))
    .limit(1);
  if (!row) return null;

  await db.update(refreshTokens).set({ lastUsedAt: new Date() }).where(eq(refreshTokens.id, row.id));

  return payload.sub;
}

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: string;
}

/** Revokes every still-live token sharing this family -- the reuse-detection response: one stolen/replayed token torches its whole lineage, not just itself. */
async function revokeTokenFamily(db: Database, familyId: string, reason: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

/**
 * Verifies the presented refresh token and, if it's still live, atomically
 * revokes it and issues a replacement in the same family -- so a refresh
 * token is single-use, unlike an access token. Closes the replay window a
 * bare verify-and-reissue-access-token left open: previously a stolen
 * refresh token stayed valid for its full 30-day life with no way to tell
 * the legitimate client and an attacker apart.
 *
 * Reuse detection: if the presented token's row is already revoked
 * specifically because it was rotated (not signed-out or admin-revoked),
 * that means whoever is presenting it now is a *second* holder of a token
 * the legitimate client already exchanged -- the classic signal of theft.
 * The whole family is revoked in response, forcing every session descended
 * from that login to re-authenticate, not just this one request.
 *
 * Returns null for: an invalid/expired JWT, an unknown jti, an expired row,
 * or a row revoked for any other reason (sign-out, admin action) -- none of
 * those are reuse of a *rotated* token, so they fail closed without the
 * family-wide response.
 */
export async function rotateRefreshToken(db: Database, token: string, secret: string): Promise<RotatedRefreshToken | null> {
  const payload = decodeRefreshToken(token, secret);
  if (!payload) return null;

  const [row] = await db
    .select({
      id: refreshTokens.id,
      familyId: refreshTokens.familyId,
      userId: refreshTokens.userId,
      expiresAt: refreshTokens.expiresAt,
      revokedAt: refreshTokens.revokedAt,
      revokedReason: refreshTokens.revokedReason,
    })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.id, payload.jti), eq(refreshTokens.userId, payload.sub)))
    .limit(1);
  if (!row) return null;

  if (row.revokedAt) {
    if (row.revokedReason === 'rotated') {
      await revokeTokenFamily(db, row.familyId, 'reuse_detected');
    }
    return null;
  }
  if (row.expiresAt <= new Date()) return null;

  const newId = randomUUID();
  const refreshToken = await db.transaction(async (tx) => {
    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });

    // Someone else rotated (or is concurrently rotating) this exact token in
    // the gap between the select above and this update -- two holders of the
    // same still-live token racing each other is itself the reuse signal,
    // indistinguishable from a slightly slower theft-replay, so it gets the
    // same family-wide response rather than a quiet failure.
    if (revoked.length === 0) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), revokedReason: 'reuse_detected' })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      throw new ConcurrentRotationError();
    }

    await tx.insert(refreshTokens).values({
      id: newId,
      familyId: row.familyId,
      userId: row.userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return jwt.sign({ sub: row.userId, type: 'refresh', jti: newId } satisfies RefreshTokenPayload, secret, {
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  }).catch((err) => {
    if (err instanceof ConcurrentRotationError) return null;
    throw err;
  });

  if (refreshToken === null) return null;

  return { userId: row.userId, refreshToken };
}

class ConcurrentRotationError extends Error {}

/**
 * Revokes the single session this refresh token belongs to (e.g. sign-out on
 * one device). Ownership is re-checked in the WHERE clause -- a token can
 * only revoke its own row, never another user's, even if the jti were
 * somehow guessed. Returns true if a row was actually revoked.
 */
export async function revokeRefreshToken(db: Database, token: string, secret: string): Promise<boolean> {
  const payload = decodeRefreshToken(token, secret);
  if (!payload) return false;

  const result = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: 'user_sign_out' })
    .where(and(eq(refreshTokens.id, payload.jti), eq(refreshTokens.userId, payload.sub), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  return result.length > 0;
}

/** Revokes every still-live session for a user (e.g. an admin suspending the account). Returns the count revoked. */
export async function revokeAllRefreshTokensForUser(db: Database, userId: string, reason: string): Promise<number> {
  const result = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  return result.length;
}
