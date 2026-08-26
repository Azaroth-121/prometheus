import { NextResponse, type NextRequest } from 'next/server';
import { verifyCredentials, issueAccessToken, issueRefreshToken } from '@prometheus/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Extension-only sign-in: exchanges email+password for a self-issued
 * access/refresh token pair (replaces Supabase's anon-key + GoTrue
 * password-grant flow). The web app itself uses NextAuth's Credentials
 * provider instead, which handles this via its own cookie-based session --
 * this endpoint exists specifically because the extension can't use
 * NextAuth's cookie flow (no browser navigation/redirect to complete it).
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const profile = await verifyCredentials(db, { email: body.email, password: body.password });
  if (!profile) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  return NextResponse.json({
    access_token: issueAccessToken(profile.id, env.extensionJwtSecret),
    refresh_token: await issueRefreshToken(db, profile.id, env.extensionJwtSecret),
    // Not sensitive (the JWT itself carries no PII by design) -- returned
    // directly so the extension popup can show "Signed in as ..." without a
    // second round trip. Stored alongside the tokens in chrome.storage.local.
    email: profile.email,
  });
}
