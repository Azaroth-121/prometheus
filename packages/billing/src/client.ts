import type {
  PayPalBillingPlan,
  PayPalConfig,
  PayPalProduct,
  PayPalSubscription,
  VerifyWebhookInput,
} from './types';

/**
 * Thin REST wrapper around PayPal's API, not the official SDK — same call
 * as calling OpenAI directly in /api/v1/optimize: full control, predictable
 * behavior, and trivial to point at sandbox vs live via one config value.
 */

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(config: PayPalConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`PayPal OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

async function paypalFetch<T>(config: PayPalConfig, path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken(config);
  const response = await fetch(`${config.apiBase}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`PayPal API error ${response.status} on ${path}: ${await response.text()}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function createProduct(
  config: PayPalConfig,
  input: { name: string; description: string },
): Promise<PayPalProduct> {
  return paypalFetch(config, '/v1/catalogs/products', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  });
}

export async function createBillingPlan(
  config: PayPalConfig,
  input: { productId: string; name: string; monthlyPrice: string; currency: string },
): Promise<PayPalBillingPlan> {
  return paypalFetch(config, '/v1/billing/plans', {
    method: 'POST',
    body: JSON.stringify({
      product_id: input.productId,
      name: input.name,
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: input.monthlyPrice, currency_code: input.currency },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    }),
  });
}

export async function createSubscription(
  config: PayPalConfig,
  input: { planId: string; returnUrl: string; cancelUrl: string },
): Promise<PayPalSubscription> {
  return paypalFetch(config, '/v1/billing/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: input.planId,
      application_context: {
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        user_action: 'SUBSCRIBE_NOW',
      },
    }),
  });
}

export async function getSubscription(
  config: PayPalConfig,
  subscriptionId: string,
): Promise<PayPalSubscription> {
  return paypalFetch(config, `/v1/billing/subscriptions/${subscriptionId}`, { method: 'GET' });
}

export async function verifyWebhookSignature(
  config: PayPalConfig,
  input: VerifyWebhookInput,
): Promise<boolean> {
  const result = await paypalFetch<{ verification_status: string }>(
    config,
    '/v1/notifications/verify-webhook-signature',
    {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: input.authAlgo,
        cert_url: input.certUrl,
        transmission_id: input.transmissionId,
        transmission_sig: input.transmissionSig,
        transmission_time: input.transmissionTime,
        webhook_id: input.webhookId,
        webhook_event: input.webhookEvent,
      }),
    },
  );
  return result.verification_status === 'SUCCESS';
}
