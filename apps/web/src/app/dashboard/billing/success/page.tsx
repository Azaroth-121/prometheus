import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@prometheus/auth';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import { getSubscription } from '@prometheus/billing';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

/**
 * Activates the subscription on the redirect back from PayPal's approval
 * page, independent of webhook delivery (webhooks can't reach localhost —
 * see documentation/architecture/implementation-notes.md).
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ subscription_id?: string }>;
}) {
  const { subscription_id: subscriptionId } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile) redirect('/login');
  if (!subscriptionId) redirect('/dashboard/billing');

  const paypalConfig = {
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    apiBase: env.paypalApiBase,
  };

  const paypalSubscription = await getSubscription(paypalConfig, subscriptionId);

  if (paypalSubscription.status !== 'ACTIVE' && paypalSubscription.status !== 'APPROVED') {
    redirect('/dashboard/billing');
  }

  const serviceClient = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { data: plan } = await serviceClient
    .from('plans')
    .select('id')
    .eq('provider_plan_id', paypalSubscription.plan_id)
    .single();

  if (plan) {
    const nowIso = new Date().toISOString();
    await serviceClient.from('subscriptions').upsert(
      {
        user_id: profile.id,
        provider: 'paypal',
        provider_customer_id: paypalSubscription.subscriber?.payer_id ?? 'unknown',
        provider_subscription_id: paypalSubscription.id,
        plan_id: plan.id,
        status: paypalSubscription.status === 'ACTIVE' ? 'active' : 'incomplete',
        current_period_start: nowIso,
        current_period_end: paypalSubscription.billing_info?.next_billing_time ?? nowIso,
        cancel_at_period_end: false,
      },
      { onConflict: 'provider_subscription_id' },
    );
  }

  redirect('/dashboard');
}
