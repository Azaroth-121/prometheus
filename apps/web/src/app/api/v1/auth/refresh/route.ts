import { NextResponse, type NextRequest } from 'next/server';
import { rotateRefreshToken, issueAccessToken } from '@prometheus/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Replaces Supabase's `POST /auth/v1/token?grant_type=refresh_token`, which
 * apps/extension/src/background.ts used to call directly against Supabase's
 * GoTrue endpoint.
 *
 * Rotates the refresh token on every call (see rotateRefreshToken's own doc
 * comment) rather than just verifying it and handing back a new access
 * token -- a refresh token used to stay valid, replayable, for its full
 * 30-day life. The response now includes a new `refresh_token` too, which
 * the caller MUST persist in place of the one it sent (see
 * apps/extension/src/lib/session.ts's refreshSession) -- the old one is
 * revoked the instant this call succeeds, and presenting it again is treated
 * as a stolen-token signal that revokes the whole session family.
 */
export async function POST(request: NextRequest) {
  let body: { refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400 });
  }

  if (!body.refresh_token) {
    return NextResponse.json({ error: 'refresh_token is required.' }, { status: 400 });
  }

  const rotated = await rotateRefreshToken(db, body.refresh_token, env.extensionJwtSecret);
  if (!rotated) {
    return NextResponse.json({ error: 'Invalid or expired refresh token.' }, { status: 401 });
  }

  return NextResponse.json({
    access_token: issueAccessToken(rotated.userId, env.extensionJwtSecret),
    refresh_token: rotated.refreshToken,
  });
}
