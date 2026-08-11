import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { UsageSummary } from '@prometheus/shared-types';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import { getUsageSummary } from '@prometheus/billing';
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

  const anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const { data: authData, error: authError } = await anonClient.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }

  const serviceClient = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const summary = await getUsageSummary(serviceClient, authData.user.id);

  return NextResponse.json<UsageSummary>(summary);
}
