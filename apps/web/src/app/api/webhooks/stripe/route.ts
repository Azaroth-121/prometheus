import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { plans, subscriptions, webhookEvents } from '@prometheus/database';
import { constructWebhookEvent, createStripeClient } from '@prometheus/billing';
import type { SubscriptionStatus } from '@prometheus/shared-types';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Unlike the PayPal webhook it replaces (an audit-log-only sink -- real
 * activation happened on the redirect-back success page, which could be
 * lost if the tab closed early), this webhook IS the source of truth for
 * subscription state. Verification is local (stripe.webhooks.constructEvent,
 * HMAC-SHA256), not a live API round-trip like PayPal's.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = createStripeClient(env.stripeSecretKey);

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(stripe, rawBody, signature, env.stripeWebhookSecret);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid webhook signature.', detail: String(err) }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, 'stripe'), eq(webhookEvents.providerEventId, event.id)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ status: 'already_processed' });
  }

  const [webhookEventRow] = await db
    .insert(webhookEvents)
    .values({
      provider: 'stripe',
      providerEventId: event.id,
      eventType: event.type,
      status: 'received',
      payloadHash: createHash('sha256').update(rawBody).digest('hex'),
    })
    .returning({ id: webhookEvents.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === 'string') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await upsertSubscriptionFromStripe(subscription);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (typeof invoice.subscription === 'string') {
          await db
            .update(subscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(subscriptions.providerSubscriptionId, invoice.subscription));
        }
        break;
      }
      default:
        break;
    }

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
    return NextResponse.json({ error: 'Failed to process webhook.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}

/** Shared by checkout.session.completed (after retrieving the full subscription) and both customer.subscription.* events (which already carry it). */
async function upsertSubscriptionFromStripe(sub: Stripe.Subscription): Promise<void> {
  const priceId = sub.items.data[0]?.price.id;
  const [plan] = priceId
    ? await db.select({ id: plans.id }).from(plans).where(eq(plans.providerPlanId, priceId)).limit(1)
    : [];
  if (!plan) return;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  await db
    .insert(subscriptions)
    .values({
      userId: await lookUpUserIdByCustomerId(customerId, sub.metadata),
      provider: 'stripe',
      providerCustomerId: customerId,
      providerSubscriptionId: sub.id,
      planId: plan.id,
      status: sub.status as SubscriptionStatus,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    })
    .onConflictDoUpdate({
      target: subscriptions.providerSubscriptionId,
      set: {
        planId: plan.id,
        status: sub.status as SubscriptionStatus,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });
}

/**
 * On first checkout there's no existing subscriptions row to find the user
 * from by customer id -- Stripe's own record has no notion of our profile
 * id unless we tell it one. checkout.session.completed's session carries
 * `client_reference_id`/metadata we could set at creation time; simplest
 * robust option instead is looking up any prior row for this Stripe
 * customer (present on every event after the first) and, for a genuinely
 * first-ever event, falling back to the email on the Stripe Customer object.
 */
async function lookUpUserIdByCustomerId(customerId: string, metadata: Stripe.Metadata): Promise<string> {
  const [existingRow] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.providerCustomerId, customerId))
    .limit(1);
  if (existingRow) return existingRow.userId;

  if (metadata.userId) return metadata.userId;

  throw new Error(`No existing subscription row or userId metadata for Stripe customer ${customerId} -- cannot attribute this subscription to a profile.`);
}
