import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { constructWebhookEvent, createStripeClient } from './client';

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
