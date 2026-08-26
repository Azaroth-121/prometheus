import { NextResponse, type NextRequest } from 'next/server';
import { revokeRefreshToken } from '@prometheus/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Called by the extension's signOut() -- makes sign-out actually invalidate
 * the refresh token server-side instead of just clearing local storage.
 * Always returns 200 regardless of whether a matching, still-live token was
 * found, so this can't be used to probe for valid tokens.
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

  await revokeRefreshToken(db, body.refresh_token, env.extensionJwtSecret);

  return NextResponse.json({ status: 'ok' });
}
