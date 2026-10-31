-- Usage alerts (C.5, documentation/architecture/usage-alerts.md): one row per
-- alert emailed to an organization's owner and billing managers when its
-- shared pool reaches 80% or 100%. Apply after 0007_add_organization_licenses.sql.
--
-- A row is "already alerted" for the rest of the usage period, so each
-- threshold is emailed once per period. A row with sent_at null was claimed
-- but not delivered (the webhook isn't configured), and still counts.
create table organization_usage_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  threshold smallint not null check (threshold in (80, 100)),
  period_start timestamptz not null,
  requests_used integer not null,
  tokens_used integer not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index organization_usage_alerts_organization_id_idx
  on organization_usage_alerts(organization_id, created_at desc);
