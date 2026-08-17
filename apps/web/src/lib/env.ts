function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL', process.env.DATABASE_URL);
  },
  /** NextAuth's own session-cookie signing secret (web app sessions only). */
  get authSecret() {
    return required('AUTH_SECRET', process.env.AUTH_SECRET);
  },
  /** Signs the extension's self-issued access/refresh token pair -- separate from
   * authSecret so the two token systems (cookie sessions vs. extension bearer
   * tokens) can be rotated independently. */
  get extensionJwtSecret() {
    return required('EXTENSION_JWT_SECRET', process.env.EXTENSION_JWT_SECRET);
  },
  get openaiApiKey() {
    return required('OPENAI_API_KEY', process.env.OPENAI_API_KEY);
  },
  get paypalClientId() {
    return required('PAYPAL_CLIENT_ID', process.env.PAYPAL_CLIENT_ID);
  },
  get paypalClientSecret() {
    return required('PAYPAL_CLIENT_SECRET', process.env.PAYPAL_CLIENT_SECRET);
  },
  get paypalApiBase() {
    return required('PAYPAL_API_BASE', process.env.PAYPAL_API_BASE);
  },
  /** Blank until a webhook is registered against a publicly reachable URL — not required(). */
  get paypalWebhookId(): string {
    return process.env.PAYPAL_WEBHOOK_ID ?? '';
  },
  get appUrl() {
    return required('NEXT_PUBLIC_APP_URL', process.env.NEXT_PUBLIC_APP_URL);
  },
  get cronSecret() {
    return required('CRON_SECRET', process.env.CRON_SECRET);
  },
  get makeExpiryWebhookUrl() {
    return required('MAKE_EXPIRY_WEBHOOK_URL', process.env.MAKE_EXPIRY_WEBHOOK_URL);
  },
  /** Same Make.com-webhook-sends-the-email pattern as expiry reminders, for
   * the sign-up email-verification link. */
  get makeVerificationWebhookUrl() {
    return required('MAKE_VERIFICATION_WEBHOOK_URL', process.env.MAKE_VERIFICATION_WEBHOOK_URL);
  },
};
