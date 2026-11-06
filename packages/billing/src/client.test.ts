import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { changeSubscriptionQuantity, constructWebhookEvent, createCheckoutSession, createStripeClient } from './client';

const SECRET = 'whsec_test_secret';

/**
 * Real cryptographic verification, not a mocked fetch -- unlike PayPal's
 * verify-webhook-signature (a live API round-trip), Stripe's signing is a
 * local HMAC-SHA256 check we can exercise for real with the SDK's own test
 * helper for constructing a validly-signed header.
 */
describe('constructWebhookEvent', () => {
  const stripe = createStripeClient('sk_test_dummy');
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } });

  it('accepts a payload with a validly-signed header', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    const event = constructWebhookEvent(stripe, payload, header, SECRET);

    expect(event.id).toBe('evt_1');
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects a payload whose body was tampered with after signing', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const tamperedPayload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: { object: {} } });

    expect(() => constructWebhookEvent(stripe, tamperedPayload, header, SECRET)).toThrow(Stripe.errors.StripeSignatureVerificationError);
  });

  it('rejects a header signed with the wrong secret', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_a_different_secret' });

    expect(() => constructWebhookEvent(stripe, payload, header, SECRET)).toThrow(Stripe.errors.StripeSignatureVerificationError);
  });
});

describe('createCheckoutSession', () => {
  function stubStripe() {
    const create = vi.fn().mockResolvedValue({ id: 'cs_test_1' });
    return { stripe: { checkout: { sessions: { create } } } as unknown as Stripe, create };
  }

  const baseInput = {
    customerId: null,
    customerEmail: 'owner@example.com',
    userId: 'user_1',
    organizationId: 'org_1',
    priceId: 'price_1',
    successUrl: 'https://app.test/success',
    cancelUrl: 'https://app.test/cancel',
  };

  it('buys the requested number of licenses', async () => {
    const { stripe, create } = stubStripe();

    await createCheckoutSession(stripe, { ...baseInput, quantity: 25 });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: 'price_1', quantity: 25 }] }));
  });

  it('defaults to a single license', async () => {
    const { stripe, create } = stubStripe();

    await createCheckoutSession(stripe, baseInput);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: 'price_1', quantity: 1 }] }));
  });
});

describe('changeSubscriptionQuantity', () => {
  function stubStripe(currentQuantity: number, updated: { quantity: number; pending?: boolean }) {
    const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: 'si_1', quantity: currentQuantity }] } });
    const update = vi.fn().mockResolvedValue({
      items: { data: [{ id: 'si_1', quantity: updated.quantity }] },
      pending_update: updated.pending ? { expires_at: 0 } : null,
    });
    return { stripe: { subscriptions: { retrieve, update } } as unknown as Stripe, update };
  }

  it('invoices the prorated difference when adding licenses', async () => {
    const { stripe, update } = stubStripe(10, { quantity: 15 });

    const result = await changeSubscriptionQuantity(stripe, 'sub_1', 15);

    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', quantity: 15 }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    });
    expect(result).toEqual({ quantity: 15, pendingPayment: false });
  });

  it('keeps the current quantity while an increase waits on payment', async () => {
    const { stripe } = stubStripe(10, { quantity: 10, pending: true });

    expect(await changeSubscriptionQuantity(stripe, 'sub_1', 15)).toEqual({ quantity: 10, pendingPayment: true });
  });

  it('removes licenses without a credit', async () => {
    const { stripe, update } = stubStripe(10, { quantity: 6 });

    await changeSubscriptionQuantity(stripe, 'sub_1', 6);

    expect(update).toHaveBeenCalledWith('sub_1', { items: [{ id: 'si_1', quantity: 6 }], proration_behavior: 'none' });
  });

  it('does not call Stripe when the quantity is unchanged', async () => {
    const { stripe, update } = stubStripe(10, { quantity: 10 });

    await changeSubscriptionQuantity(stripe, 'sub_1', 10);

    expect(update).not.toHaveBeenCalled();
  });
});
