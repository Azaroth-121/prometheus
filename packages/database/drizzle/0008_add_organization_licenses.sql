-- Organization licenses (ADR-004, documentation/architecture/organization-licenses.md).
-- Numbered 0008 because 0006 (refresh-token rotation) and 0007 (signup lead
-- fields) are taken. Needs 0005_add_organizations.sql; doesn't depend on 0006 or 0007.

-- Licenses purchased: the Stripe subscription item's quantity, written by the
-- webhook. Existing rows were all checked out with quantity 1.
alter table organization_subscriptions
  add column seat_quantity integer not null default 1 check (seat_quantity >= 1);

-- Licenses assigned: a member holds one of the organization's licenses while
-- this is set. Membership and licenses are separate, so it stays null for
-- members who only manage the organization.
alter table organization_members
  add column license_assigned_at timestamptz;

create index organization_members_licensed_idx
  on organization_members(organization_id)
  where license_assigned_at is not null;

-- Grace path for organizations that existed before licenses: every current
-- member keeps access. The admin console reports any organization over its
-- purchased count until the owner buys more licenses or removes some.
update organization_members set license_assigned_at = now();
