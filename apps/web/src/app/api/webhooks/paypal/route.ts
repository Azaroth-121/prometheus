import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import { verifyWebhookSignature } from '@prometheus/billing';
import { env } from '@/lib/env';

const SUBSCRIPTION_STATUS_MAP: Record<string, string> = {
  'BILLING.SUBSCRIPTION.ACTIVATED': 'active',
  'BILLING.SUBSCRIPTION.CANCELLED': 'canceled',
  'BILLING.SUBSCRIPTION.SUSPENDED': 'past_due',
  'BILLING.SUBSCRIPTION.EXPIRED': 'canceled',
};

/**
 * Requires PAYPAL_WEBHOOK_ID, which only exists once a webhook is
 * registered against a publicly reachable URL — not possible from
 * localhost. Returns 501 until that's configured (see
 * documentation/architecture/implementation-notes.md).
 */
export async function POST(request: NextRequest) {
  const webhookId = env.paypalWebhookId;
  if (!webhookId) {
    return NextResponse.json({ error: 'PayPal webhook is not configured yet.' }, { status: 501 });
  }

  const rawBody = await request.text();
  const event = JSON.parse(rawBody);

  const paypalConfig = {
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    apiBase: env.paypalApiBase,
  };

  const isValid = await verifyWebhookSignature(paypalConfig, {
    authAlgo: request.headers.get('paypal-auth-algo') ?? '',
    certUrl: request.headers.get('paypal-cert-url') ?? '',
    transmissionId: request.headers.get('paypal-transmission-id') ?? '',
    transmissionSig: request.headers.get('paypal-transmission-sig') ?? '',
    transmissionTime: request.headers.get('paypal-transmission-time') ?? '',
    webhookId,
    webhookEvent: event,
  });

  if (!isValid) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  const serviceClient = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);

  const { data: existing } = await serviceClient
    .from('webhook_events')
    .select('id')
    .eq('provider', 'paypal')
    .eq('provider_event_id', event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ status: 'already_processed' });
  }

  const { data: webhookEventRow } = await serviceClient
    .from('webhook_events')
    .insert({
      provider: 'paypal',
      provider_event_id: event.id,
      event_type: event.event_type,
      status: 'received',
      payload_hash: createHash('sha256').update(rawBody).digest('hex'),
    })
    .select('id')
    .single();

  try {
    const mappedStatus = SUBSCRIPTION_STATUS_MAP[event.event_type];
    const subscriptionId = event.resource?.id;

    if (mappedStatus && subscriptionId) {
      await serviceClient
        .from('subscriptions')
        .update({ status: mappedStatus })
        .eq('provider_subscription_id', subscriptionId);
    }

    if (webhookEventRow) {
      await serviceClient
        .from('webhook_events')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', webhookEventRow.id);
    }
  } catch (err) {
    if (webhookEventRow) {
      await serviceClient
        .from('webhook_events')
        .update({
          status: 'failed',
          error_message: String(err),
          processed_at: new Date().toISOString(),
        })
        .eq('id', webhookEventRow.id);
    }
  }

  return NextResponse.json({ status: 'ok' });
}
