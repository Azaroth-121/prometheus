export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string;
}

export interface PayPalProduct {
  id: string;
  name: string;
}

export interface PayPalBillingPlan {
  id: string;
  status: string;
}

export interface PayPalSubscriptionLink {
  href: string;
  rel: string;
  method: string;
}

export type PayPalSubscriptionStatus =
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface PayPalSubscription {
  id: string;
  status: PayPalSubscriptionStatus;
  plan_id: string;
  subscriber?: { payer_id?: string; email_address?: string };
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { time: string };
  };
  links: PayPalSubscriptionLink[];
}

export interface VerifyWebhookInput {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  webhookEvent: unknown;
}
