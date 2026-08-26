import Stripe from 'stripe';

/**
 * Official Stripe SDK, unlike the hand-rolled PayPal REST client this
 * replaces -- PayPal's 3-endpoint surface justified writing our own wrapper
 * for full control; Stripe's SDK is the standard, well-typed way to do this,
 * and stripe.webhooks.constructEvent does real local HMAC verification
 * (no network round-trip, unlike PayPal's verify-webhook-signature API call).
 *
 * Real recurring subscriptions (mode: 'subscription'), not one-time Orders --
 * see packages/billing/src/plans.ts and the subscriptions table comment.
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

export interface CreateCheckoutSessionInput {
  /** Reuse the customer's existing Stripe Customer id across purchases/upgrades if they have one. */
  customerId: string | null;
  customerEmail: string;
  /** Stamped onto the resulting Subscription's metadata -- the webhook has no other way to attribute a brand-new customer's first subscription to a profile. */
  userId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  stripe: Stripe,
  input: CreateCheckoutSessionInput
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    subscription_data: { metadata: { userId: input.userId } },
    ...(input.customerId ? { customer: input.customerId } : { customer_email: input.customerEmail }),
  });
}

export interface CreateBillingPortalSessionInput {
  customerId: string;
  returnUrl: string;
}

/** Stripe's hosted Customer Portal handles cancel/payment-method updates (and plan switching, if enabled) -- no custom UI needed. */
export async function createBillingPortalSession(
  stripe: Stripe,
  input: CreateBillingPortalSessionInput
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

/** Throws if the signature doesn't match -- same fail-closed contract the caller already expects. */
export function constructWebhookEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
