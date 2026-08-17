-- Prometheus schema, Azure Postgres edition.
--
-- Ported from the 5 Supabase migrations (20260728000000_initial_schema.sql
-- through 20260812000000_add_subscription_reminder_sent_at.sql), with:
--   - profiles.id no longer references auth.users(id) -- it IS the identity
--     table now, with password_hash/email_verified_at/email_verification_*
--     replacing what Supabase's separate auth.users table used to own.
--   - No Row Level Security anywhere. Confirmed via full read of the
--     application code: only profiles ever had a client-writable RLS policy;
--     every money-critical path (optimize, usage, checkout, webhooks, cron)
--     already used the service-role client and did its own authorization in
--     application code. The remaining RLS-dependent reads (dashboard/admin
--     pages) get explicit `WHERE user_id = ...` / role checks in query code
--     instead -- see packages/auth's requireRole/requireAdmin.
--   - is_admin(), handle_new_user(), protect_profile_privileged_fields() (all
--     auth.uid()-dependent) are dropped, not ported. handle_new_user's job
--     (create a profile row on sign-up) becomes an explicit insert in the
--     sign-up route. protect_profile_privileged_fields's job (block a
--     non-admin from self-promoting role/status) is redundant once
--     admin/users/actions.ts's existing requireAdmin() call is the only path
--     that can reach this update at all.
--   - set_updated_at() and its three triggers are portable as-is (plain
--     Postgres, never depended on Supabase).
--   - usage_periods is NOT ported: nothing in the application ever wrote to
--     it (usage is computed live from optimization_requests instead). Dead
--     schema under Supabase, not carried forward.

-- gen_random_uuid() is built into Postgres core since PG13 -- no extension
-- needed on Azure Postgres Flexible Server's default engine versions.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  role text not null default 'user' check (role in ('user', 'support', 'analyst', 'admin', 'super_admin')),
  password_hash text not null,
  email_verified_at timestamptz,
  email_verification_token text,
  email_verification_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  monthly_price numeric(10, 2) not null,
  currency text not null default 'usd',
  monthly_request_limit integer not null,
  monthly_token_limit integer not null,
  maximum_input_length integer not null,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  provider_plan_id text
);

-- ---------------------------------------------------------------------------
-- subscriptions (one-time 30-day access grants, PayPal Orders API -- not
-- true recurring subscriptions despite the table shape; see packages/billing)
-- ---------------------------------------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  provider text not null default 'paypal' check (provider in ('stripe', 'paypal')),
  provider_customer_id text not null,
  provider_subscription_id text not null unique,
  plan_id uuid not null references plans (id),
  status text not null check (
    status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')
  ),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on subscriptions (user_id);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- optimization_requests (the usage ledger -- safety-critical)
-- ---------------------------------------------------------------------------
create table optimization_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  client_request_id text not null,
  source text not null,
  mode text not null,
  prompt_version text not null,
  model text not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  input_character_count integer not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric(10, 4),
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_request_id)
);

create index optimization_requests_user_id_idx on optimization_requests (user_id);

-- ---------------------------------------------------------------------------
-- prompt_history (optional, user-opt-in)
-- ---------------------------------------------------------------------------
create table prompt_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references optimization_requests (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  input_text_encrypted text not null,
  output_text_encrypted text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index prompt_history_user_id_idx on prompt_history (user_id);

-- ---------------------------------------------------------------------------
-- prompt_configs (admin-managed; not yet actually consumed by the optimize
-- route -- that still reads packages/prompts TS code)
-- ---------------------------------------------------------------------------
create table prompt_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  system_prompt text not null,
  model text not null,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (name, version)
);

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- ---------------------------------------------------------------------------
create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references profiles (id),
  action text not null,
  target_type text not null,
  target_id text not null,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  reason text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- system_events
-- ---------------------------------------------------------------------------
create table system_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  service text not null,
  severity text not null check (severity in ('debug', 'info', 'warning', 'error', 'critical')),
  event_type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- webhook_events
-- ---------------------------------------------------------------------------
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique (provider, provider_event_id)
);
