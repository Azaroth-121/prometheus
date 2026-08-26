import { NextResponse, type NextRequest } from 'next/server';
import { verifyRefreshToken, issueAccessToken } from '@prometheus/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Replaces Supabase's `POST /auth/v1/token?grant_type=refresh_token`, which
 * apps/extension/src/background.ts used to call directly against Supabase's
 * GoTrue endpoint. Same shape (refresh token in, fresh access token out) so
 * background.ts's refresh loop needs its endpoint URL and response field
 * names updated, not its overall structure.
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

  const userId = await verifyRefreshToken(db, body.refresh_token, env.extensionJwtSecret);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired refresh token.' }, { status: 401 });
  }

  return NextResponse.json({
    access_token: issueAccessToken(userId, env.extensionJwtSecret),
  });
}
