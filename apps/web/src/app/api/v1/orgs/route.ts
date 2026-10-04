import { NextResponse, type NextRequest } from 'next/server';
import type { OrgsResponse } from '@prometheus/shared-types';
import { getCurrentProfile, resolveActiveOrg, verifyAccessToken } from '@prometheus/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getUserOrgs } from '@/lib/org';

/**
 * The extension's way to read the caller's orgs -- same getUserOrgs() seam
 * the dashboard header uses, so both surfaces switch to real org data
 * together when E0.2/E0.4 land. 404 while FEATURE_ORGS is off, so the
 * extension can tell "feature not live" apart from a real error and simply
 * not render the org UI.
 */
export async function GET(request: NextRequest) {
  if (!env.featureOrgs) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 });
  }

  const userId = verifyAccessToken(accessToken, env.extensionJwtSecret);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }

  const profile = await getCurrentProfile(db, userId);
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'This account is not active.' }, { status: 403 });
  }

  const orgs = await getUserOrgs(profile);
  // No orgId claim in the access token until E0.4 -- pass it here once it exists.
  const active = resolveActiveOrg(orgs);

  return NextResponse.json<OrgsResponse>({ orgs, active_org_id: active?.id ?? null });
}
