-- Prometheus Phase 1 schema (plan doc section 6).
-- plans/subscriptions land structurally now; seeding and billing logic are Phase 4.
-- prompt_configs/admin_audit_logs/system_events/webhook_events are consumed starting Phase 2/5;
-- created now so RLS and FKs are in place from day one.

-- ---------------------------------------------------------------------------
-- profiles
-- (created before is_admin()/triggers below, since they reference it)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  role text not null default 'user' check (role in ('user', 'support', 'analyst', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Helper: is_admin()
-- SECURITY DEFINER so RLS policies can check role without recursing on
-- profiles' own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Non-admins may update their own row (e.g. display_name) but must not be
-- able to grant themselves elevated role/status through that same policy.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Only admins may change role or status.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileged_fields
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

-- Auto-create a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  monthly_price numeric(10, 2) not null,
  currency text not null default 'usd',
  monthly_request_limit integer not null,
  monthly_token_limit integer not null,
  maximum_input_length integer not null,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true
);

alter table public.plans enable row level security;

create policy "plans_select_active_or_admin"
  on public.plans for select
  using (is_active or public.is_admin());

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_customer_id text not null,
  provider_subscription_id text not null unique,
  plan_id uuid not null references public.plans (id),
  status text not null check (
    status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')
  ),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own_or_admin"
  on public.subscriptions for select
  using (auth.uid() = user_id or public.is_admin());

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- usage_periods
-- ---------------------------------------------------------------------------
create table public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  request_count integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

create index usage_periods_user_id_idx on public.usage_periods (user_id);

alter table public.usage_periods enable row level security;

create policy "usage_periods_select_own_or_admin"
  on public.usage_periods for select
  using (auth.uid() = user_id or public.is_admin());

create trigger usage_periods_set_updated_at
  before update on public.usage_periods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- optimization_requests
-- ---------------------------------------------------------------------------
create table public.optimization_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
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

create index optimization_requests_user_id_idx on public.optimization_requests (user_id);

alter table public.optimization_requests enable row level security;

create policy "optimization_requests_select_own_or_admin"
  on public.optimization_requests for select
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- prompt_history (optional, user-opt-in — see plan doc section 6)
-- ---------------------------------------------------------------------------
create table public.prompt_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.optimization_requests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  input_text_encrypted text not null,
  output_text_encrypted text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index prompt_history_user_id_idx on public.prompt_history (user_id);

alter table public.prompt_history enable row level security;

create policy "prompt_history_select_own_or_admin"
  on public.prompt_history for select
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- prompt_configs (admin-managed — plan doc section 5.3)
-- ---------------------------------------------------------------------------
create table public.prompt_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  system_prompt text not null,
  model text not null,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (name, version)
);

alter table public.prompt_configs enable row level security;

create policy "prompt_configs_admin_only"
  on public.prompt_configs for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- ---------------------------------------------------------------------------
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles (id),
  action text not null,
  target_type text not null,
  target_id text not null,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;

create policy "admin_audit_logs_admin_select"
  on public.admin_audit_logs for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- system_events
-- ---------------------------------------------------------------------------
create table public.system_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  service text not null,
  severity text not null check (severity in ('debug', 'info', 'warning', 'error', 'critical')),
  event_type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_events enable row level security;

create policy "system_events_admin_select"
  on public.system_events for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- webhook_events
-- ---------------------------------------------------------------------------
create table public.webhook_events (
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

alter table public.webhook_events enable row level security;

create policy "webhook_events_admin_select"
  on public.webhook_events for select
  using (public.is_admin());
