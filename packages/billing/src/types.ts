export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  apiBase: string;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method: string;
}

export type PayPalOrderStatus =
  | 'CREATED'
  | 'SAVED'
  | 'APPROVED'
  | 'VOIDED'
  | 'COMPLETED'
  | 'PAYER_ACTION_REQUIRED';

export interface PayPalOrder {
  id: string;
  status: PayPalOrderStatus;
  links: PayPalLink[];
  payer?: { payer_id?: string; email_address?: string };
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
