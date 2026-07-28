function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
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
};
