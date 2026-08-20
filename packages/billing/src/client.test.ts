import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyWebhookSignature } from './client';
import type { PayPalConfig, VerifyWebhookInput } from './types';

const config: PayPalConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  apiBase: 'https://api-m.sandbox.paypal.com',
};

const input: VerifyWebhookInput = {
  authAlgo: 'SHA256withRSA',
  certUrl: 'https://api.paypal.com/cert/abc',
  transmissionId: 'txn-123',
  transmissionSig: 'sig-abc',
  transmissionTime: '2026-08-20T00:00:00Z',
  webhookId: 'WH-TEST-ID',
  webhookEvent: { id: 'evt-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' },
};

/** Routes by path so this works regardless of client.ts's internal OAuth
 * token caching -- the OAuth call may or may not happen depending on
 * whether a prior test in this file already warmed the module-level cache. */
function mockFetch(onVerifyRequest: (body: Record<string, unknown>) => void) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = url.toString();

    if (path.endsWith('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), {
        status: 200,
      });
    }

    if (path.endsWith('/v1/notifications/verify-webhook-signature')) {
      onVerifyRequest(JSON.parse(init!.body as string));
      return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), { status: 200 });
    }

    throw new Error(`Unexpected fetch to ${path}`);
  });
}

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps every header/field onto the exact PayPal-documented request shape', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', mockFetch((body) => (capturedBody = body)));

    const result = await verifyWebhookSignature(config, input);

    expect(result).toBe(true);
    expect(capturedBody).toEqual({
      auth_algo: input.authAlgo,
      cert_url: input.certUrl,
      transmission_id: input.transmissionId,
      transmission_sig: input.transmissionSig,
      transmission_time: input.transmissionTime,
      webhook_id: input.webhookId,
      webhook_event: input.webhookEvent,
    });
  });

  it('returns false when PayPal reports anything other than SUCCESS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (url.toString().endsWith('/v1/oauth2/token')) {
          return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ verification_status: 'FAILURE' }), { status: 200 });
      })
    );

    const result = await verifyWebhookSignature(config, input);

    expect(result).toBe(false);
  });
});
