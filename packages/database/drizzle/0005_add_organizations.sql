create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_created_by_idx on organizations(created_by);

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'billing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_organization_user_key unique (organization_id, user_id)
);

create index organization_members_user_id_idx on organization_members(user_id);
create unique index organization_members_single_owner_key
  on organization_members(organization_id)
  where role = 'owner';

alter table profiles add column active_organization_id uuid references organizations(id) on delete set null;

create table organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member', 'billing')),
  token_hash text not null unique,
  invited_by uuid not null references profiles(id),
  expires_at timestamptz not null,
  accepted_by uuid references profiles(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index organization_invitations_organization_id_idx on organization_invitations(organization_id);
create index organization_invitations_email_idx on organization_invitations(lower(email));
create unique index organization_invitations_pending_email_key
  on organization_invitations(organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  provider_customer_id text not null,
  provider_subscription_id text not null unique,
  plan_id uuid not null references plans(id),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_subscriptions_organization_id_idx on organization_subscriptions(organization_id);

alter table optimization_requests
  add column organization_id uuid references organizations(id) on delete set null;
create index optimization_requests_organization_id_idx on optimization_requests(organization_id);

alter table admin_audit_logs
  add column organization_id uuid references organizations(id) on delete set null;
create index admin_audit_logs_organization_id_idx on admin_audit_logs(organization_id);
