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
  const [row] = await db
    .insert(refreshTokens)
    .values({
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
