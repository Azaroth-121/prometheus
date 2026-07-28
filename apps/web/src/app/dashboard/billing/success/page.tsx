import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@prometheus/auth';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import { captureOrder } from '@prometheus/billing';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

const ACCESS_PERIOD_DAYS = 30;

/**
 * Activates access on the redirect back from PayPal's approval page,
 * independent of webhook delivery (webhooks can't reach localhost — see
 * documentation/architecture/implementation-notes.md). `token` is PayPal's
 * own param (the order id); `plan` is ours, appended when creating the order.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; plan?: string }>;
}) {
  const { token: orderId, plan: planCode } = await searchParams;
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile) redirect('/login');
  if (!orderId || !planCode) redirect('/dashboard/billing');

  const paypalConfig = {
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    apiBase: env.paypalApiBase,
  };

  const order = await captureOrder(paypalConfig, orderId);

  if (order.status !== 'COMPLETED') {
    redirect('/dashboard/billing');
  }

  const serviceClient = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const { data: plan } = await serviceClient
    .from('plans')
    .select('id')
    .eq('code', planCode)
    .single();

  if (plan) {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + ACCESS_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    await serviceClient.from('subscriptions').upsert(
      {
        user_id: profile.id,
        provider: 'paypal',
        provider_customer_id: order.payer?.payer_id ?? 'unknown',
        // Reusing this column for the order/transaction id — payments here
        // are one-time, not recurring subscriptions (see access.ts).
        provider_subscription_id: order.id,
        plan_id: plan.id,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
      },
      { onConflict: 'provider_subscription_id' },
    );
  }

  redirect('/dashboard/billing');
}
