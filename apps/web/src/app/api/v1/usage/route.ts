import { NextResponse, type NextRequest } from 'next/server';
import type { UsageSummary } from '@prometheus/shared-types';
import { verifyAccessToken } from '@prometheus/auth';
import { getUsageSummary } from '@prometheus/billing';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * The dashboard's server components call getUsageSummary directly — this
 * route exists for the extension, which has no direct DB access and needs
 * an HTTP endpoint the same way it already does for /api/v1/optimize.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!accessToken) {
    return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 });
  }

  const userId = verifyAccessToken(accessToken, env.extensionJwtSecret);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }

  const summary = await getUsageSummary(db, userId);

  return NextResponse.json<UsageSummary>(summary);
}
