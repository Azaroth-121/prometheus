import type { UserRole } from './roles';

export type AccountStatus = 'active' | 'suspended' | 'deleted';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  status: AccountStatus;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export interface Subscription {
  id: string;
  user_id: string;
  provider: 'stripe' | 'paypal';
  provider_customer_id: string;
  provider_subscription_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  name: string;
  code: string;
  monthly_price: number;
  currency: string;
  monthly_request_limit: number;
  monthly_token_limit: number;
  maximum_input_length: number;
  features: Record<string, unknown>;
  is_active: boolean;
  provider_plan_id: string | null;
}

export interface UsagePeriod {
  id: string;
  user_id: string;
  subscription_id: string | null;
  period_start: string;
  period_end: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  updated_at: string;
}

export type OptimizationRequestStatus = 'pending' | 'succeeded' | 'failed';

export interface OptimizationRequestRow {
  id: string;
  user_id: string;
  client_request_id: string;
  source: string;
  mode: string;
  prompt_version: string;
  model: string;
  status: OptimizationRequestStatus;
  input_character_count: number;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  latency_ms: number | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PromptHistory {
  id: string;
  request_id: string;
  user_id: string;
  input_text_encrypted: string;
  output_text_encrypted: string;
  created_at: string;
  deleted_at: string | null;
}

export type PromptConfigStatus = 'draft' | 'published' | 'archived';

export interface PromptConfig {
  id: string;
  name: string;
  version: string;
  system_prompt: string;
  model: string;
  configuration: Record<string, unknown>;
  status: PromptConfigStatus;
  created_by: string;
  created_at: string;
  published_at: string | null;
}

export interface AdminAuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  reason: string | null;
  created_at: string;
}

export type SystemEventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface SystemEvent {
  id: string;
  request_id: string | null;
  service: string;
  severity: SystemEventSeverity;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type WebhookEventStatus = 'received' | 'processed' | 'failed';

export interface WebhookEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  status: WebhookEventStatus;
  payload_hash: string;
  received_at: string;
  processed_at: string | null;
  error_message: string | null;
}
