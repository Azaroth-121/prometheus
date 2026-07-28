import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@prometheus/auth';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import { createSubscription } from '@prometheus/billing';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body: { planCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400 });
  }

  if (!body.planCode) {
    return NextResponse.json({ error: '"planCode" is required.' }, { status: 400 });
  }

  const serviceClient = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { data: plan, error: planError } = await serviceClient
    .from('plans')
    .select('*')
    .eq('code', body.planCode)
    .single();

  if (planError || !plan || !plan.provider_plan_id) {
    return NextResponse.json({ error: 'Plan is not available for checkout.' }, { status: 400 });
  }

  const paypalConfig = {
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    apiBase: env.paypalApiBase,
  };

  try {
    const subscription = await createSubscription(paypalConfig, {
      planId: plan.provider_plan_id,
      returnUrl: `${env.appUrl}/dashboard/billing/success`,
      cancelUrl: `${env.appUrl}/dashboard/billing`,
    });

    const approveUrl = subscription.links.find((link) => link.rel === 'approve')?.href;
    if (!approveUrl) {
      return NextResponse.json({ error: 'PayPal did not return an approval link.' }, { status: 502 });
    }

    return NextResponse.json({ approve_url: approveUrl });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create PayPal subscription.', detail: String(err) },
      { status: 502 },
    );
  }
}
