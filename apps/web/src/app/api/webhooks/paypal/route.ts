import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { webhookEvents } from '@prometheus/database';
import { verifyWebhookSignature } from '@prometheus/billing';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Requires PAYPAL_WEBHOOK_ID, which only exists once a webhook is
 * registered against a publicly reachable URL — not possible from
 * localhost. Returns 501 until that's configured (see
 * documentation/architecture/implementation-notes.md). The Azure migration
 * is what finally makes that URL exist.
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

  const [existing] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, 'paypal'), eq(webhookEvents.providerEventId, event.id)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ status: 'already_processed' });
  }

  const [webhookEventRow] = await db
    .insert(webhookEvents)
    .values({
      provider: 'paypal',
      providerEventId: event.id,
      eventType: event.event_type,
      status: 'received',
      payloadHash: createHash('sha256').update(rawBody).digest('hex'),
    })
    .returning({ id: webhookEvents.id });

  try {
    // Activation itself happens synchronously in the redirect-back success
    // page (payments are one-time, captured immediately) — this webhook is
    // just the audit trail for PAYMENT.CAPTURE.COMPLETED and friends.
    if (webhookEventRow) {
      await db
        .update(webhookEvents)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(webhookEvents.id, webhookEventRow.id));
    }
  } catch (err) {
    if (webhookEventRow) {
      await db
        .update(webhookEvents)
        .set({ status: 'failed', errorMessage: String(err), processedAt: new Date() })
        .where(eq(webhookEvents.id, webhookEventRow.id));
    }
  }

  return NextResponse.json({ status: 'ok' });
}
