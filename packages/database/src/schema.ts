import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  inet,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// profiles
//
// Formerly `references auth.users(id)` under Supabase Auth. Now the primary
// identity table in its own right -- password_hash/email_verified_at/
// email_verification_* replace what Supabase's separate auth.users table used
// to own. No RLS: only writes to this table ever went through Supabase RLS in
// the first place, and every other table's real authorization already ran in
// application code (see packages/auth's requireRole/requireAdmin) -- ported
// as explicit `WHERE user_id = ...` / role checks in query code instead of a
// database-level policy.
// ---------------------------------------------------------------------------
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  status: text('status', { enum: ['active', 'suspended', 'deleted'] }).notNull().default('active'),
  role: text('role', { enum: ['user', 'support', 'analyst', 'admin', 'super_admin'] })
    .notNull()
    .default('user'),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  emailVerificationToken: text('email_verification_token'),
  emailVerificationExpiresAt: timestamp('email_verification_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// plans
// ---------------------------------------------------------------------------
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  monthlyPrice: numeric('monthly_price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('usd'),
  monthlyRequestLimit: integer('monthly_request_limit').notNull(),
  monthlyTokenLimit: integer('monthly_token_limit').notNull(),
  maximumInputLength: integer('maximum_input_length').notNull(),
  features: jsonb('features').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  // Vestigial: leftover from the abandoned PayPal Subscriptions/Billing-Plans
  // approach, replaced by the Orders API (one-time payments). Not written to
  // anywhere in application code -- kept only so a future re-adoption of
  // recurring billing has somewhere to put it, not because it's used today.
  providerPlanId: text('provider_plan_id'),
});

// ---------------------------------------------------------------------------
// subscriptions
//
// Despite the name/shape, these are one-time 30-day access grants (PayPal
// Orders API), not recurring subscriptions -- see packages/billing.
// ---------------------------------------------------------------------------
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['stripe', 'paypal'] }).notNull().default('paypal'),
    providerCustomerId: text('provider_customer_id').notNull(),
    providerSubscriptionId: text('provider_subscription_id').notNull().unique(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: text('status', {
      enum: ['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid'],
    }).notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index('subscriptions_user_id_idx').on(table.userId)]
);

// ---------------------------------------------------------------------------
// optimization_requests
//
// The usage ledger checkUsageAgainstPlan (packages/billing) counts against --
// safety-critical, since it's what stops unmetered OpenAI spend.
// ---------------------------------------------------------------------------
export const optimizationRequests = pgTable(
  'optimization_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    clientRequestId: text('client_request_id').notNull(),
    source: text('source').notNull(),
    mode: text('mode').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    status: text('status', { enum: ['pending', 'succeeded', 'failed'] }).notNull().default('pending'),
    inputCharacterCount: integer('input_character_count').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    estimatedCost: numeric('estimated_cost', { precision: 10, scale: 4 }),
    latencyMs: integer('latency_ms'),
    errorCode: text('error_code'),
    // Null means no signal given -- the common case, since Copy/Replace/Not
    // helpful/Try again are all optional user actions after a result.
    outcome: text('outcome', { enum: ['accepted', 'rejected', 'retried'] }),
    outcomeRecordedAt: timestamp('outcome_recorded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('optimization_requests_user_id_idx').on(table.userId),
    unique('optimization_requests_user_id_client_request_id_key').on(table.userId, table.clientRequestId),
  ]
);

// ---------------------------------------------------------------------------
// prompt_history (optional, user-opt-in)
// ---------------------------------------------------------------------------
export const promptHistory = pgTable(
  'prompt_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    requestId: uuid('request_id')
      .notNull()
      .references(() => optimizationRequests.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    inputTextEncrypted: text('input_text_encrypted').notNull(),
    outputTextEncrypted: text('output_text_encrypted').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('prompt_history_user_id_idx').on(table.userId)]
);

// ---------------------------------------------------------------------------
// prompt_configs (admin-managed; not yet actually consumed by the optimize
// route, which still reads packages/prompts TS code -- schema exists ahead
// of that wiring, same as it did under Supabase)
// ---------------------------------------------------------------------------
export const promptConfigs = pgTable(
  'prompt_configs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    version: text('version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    model: text('model').notNull(),
    configuration: jsonb('configuration').notNull().default({}),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [unique('prompt_configs_name_version_key').on(table.name, table.version)]
);

// ---------------------------------------------------------------------------
// admin_audit_logs
// ---------------------------------------------------------------------------
export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: uuid('admin_user_id')
    .notNull()
    .references(() => profiles.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  ipAddress: inet('ip_address'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ---------------------------------------------------------------------------
// system_events
// ---------------------------------------------------------------------------
export const systemEvents = pgTable('system_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  requestId: uuid('request_id'),
  service: text('service').notNull(),
  severity: text('severity', { enum: ['debug', 'info', 'warning', 'error', 'critical'] }).notNull(),
  eventType: text('event_type').notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

// ---------------------------------------------------------------------------
// webhook_events
// ---------------------------------------------------------------------------
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    status: text('status', { enum: ['received', 'processed', 'failed'] }).notNull().default('received'),
    payloadHash: text('payload_hash').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().default(sql`now()`),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
  },
  (table) => [unique('webhook_events_provider_provider_event_id_key').on(table.provider, table.providerEventId)]
);

// Note: usage_periods (Supabase-era table) is deliberately not ported --
// nothing in the application ever wrote to it; usage is computed live from
// optimization_requests instead (see packages/billing/src/access.ts). Dead
// schema, dropped rather than carried forward.

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;
export type PlanRow = typeof plans.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type OptimizationRequestRow = typeof optimizationRequests.$inferSelect;
export type NewOptimizationRequestRow = typeof optimizationRequests.$inferInsert;
export type PromptHistoryRow = typeof promptHistory.$inferSelect;
export type PromptConfigRow = typeof promptConfigs.$inferSelect;
export type NewPromptConfigRow = typeof promptConfigs.$inferInsert;
export type AdminAuditLogRow = typeof adminAuditLogs.$inferSelect;
export type SystemEventRow = typeof systemEvents.$inferSelect;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
