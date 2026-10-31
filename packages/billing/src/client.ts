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
  /** Present when this subscription belongs to an organization rather than the individual. */
  organizationId?: string | null;
  priceId: string;
  /** Licenses to buy (ADR-004). Validate with parseLicenseQuantity first; defaults to 1. */
  quantity?: number;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  stripe: Stripe,
  input: CreateCheckoutSessionInput
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: input.quantity ?? 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    subscription_data: {
      metadata: input.organizationId
        ? { userId: input.userId, organizationId: input.organizationId, billingScope: 'organization' }
        : { userId: input.userId, billingScope: 'individual' },
    },
    ...(input.customerId ? { customer: input.customerId } : { customer_email: input.customerEmail }),
  });
}

export interface ChangeSubscriptionQuantityResult {
  /** The quantity Stripe now bills for. Unchanged while an increase awaits payment. */
  quantity: number;
  /** True when an increase is waiting on its prorated invoice being paid. */
  pendingPayment: boolean;
}

/**
 * Changes how many licenses an organization subscription bills for (ADR-004).
 * Adding licenses invoices the prorated difference immediately, and Stripe
 * only applies the new quantity once that invoice is paid. Removing licenses
 * takes effect now with no credit; the next renewal bills the lower count.
 */
export async function changeSubscriptionQuantity(
  stripe: Stripe,
  subscriptionId: string,
  quantity: number
): Promise<ChangeSubscriptionQuantityResult> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];
  if (!item) throw new Error(`Stripe subscription ${subscriptionId} has no items.`);

  const current = item.quantity ?? 1;
  if (quantity === current) return { quantity, pendingPayment: false };

  const updated = await stripe.subscriptions.update(
    subscriptionId,
    quantity > current
      ? {
          items: [{ id: item.id, quantity }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'pending_if_incomplete',
        }
      : { items: [{ id: item.id, quantity }], proration_behavior: 'none' }
  );

  return {
    quantity: updated.items.data[0]?.quantity ?? current,
    pendingPayment: Boolean(updated.pending_update),
  };
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

export interface BillingInvoice {
  id: string;
  number: string | null;
  createdAt: Date;
  /** In the currency's minor unit, as Stripe reports it -- format with formatInvoiceAmount. */
  total: number;
  currency: string;
  status: Stripe.Invoice.Status | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
}

/**
 * The customer's recent invoices, newest first, for the billing page's history
 * card (C.3). Drafts are left out: Stripe hasn't finalized or sent them yet.
 */
export async function listInvoices(stripe: Stripe, customerId: string, limit = 12): Promise<BillingInvoice[]> {
  const invoices = await stripe.invoices.list({ customer: customerId, limit });
  return invoices.data
    .filter((invoice) => invoice.status !== 'draft')
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      createdAt: new Date(invoice.created * 1000),
      total: invoice.total,
      currency: invoice.currency,
      status: invoice.status,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      pdfUrl: invoice.invoice_pdf ?? null,
    }));
}

/** Formats a Stripe minor-unit amount, so 1999 USD is "$19.99" and 1999 JPY is "¥1,999". */
export function formatInvoiceAmount(amount: number, currency: string): string {
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() });
  const fractionDigits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amount / 10 ** fractionDigits);
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
