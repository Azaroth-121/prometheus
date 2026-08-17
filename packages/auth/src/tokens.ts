import jwt from 'jsonwebtoken';

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
}

export function issueAccessToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, type: 'access' } satisfies AccessTokenPayload, secret, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function issueRefreshToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' } satisfies RefreshTokenPayload, secret, {
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

export function verifyRefreshToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret) as RefreshTokenPayload;
    if (payload.type !== 'refresh') return null;
    return payload.sub;
  } catch {
    return null;
  }
}
