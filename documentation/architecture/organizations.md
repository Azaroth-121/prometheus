# Organization architecture

Organizations extend the existing individual-account model without removing it. A profile can belong to multiple organizations and selects one active organization through `profiles.active_organization_id`. That column is only a preference: every organization-aware request joins it back through `organization_members`, so changing the value alone never grants access.

## Data model

- `organizations`: workspace identity and lifecycle.
- `organization_members`: unique user-to-organization membership with `owner`, `admin`, `member`, or `billing` role.
- `organization_invitations`: seven-day, single-use invitations. Only a SHA-256 token hash is stored.
- `organization_subscriptions`: Stripe subscription state for the shared workspace plan.
- `optimization_requests.organization_id`: nullable organization scope. Null requests remain individual-account usage.
- `admin_audit_logs.organization_id`: nullable link for both organization and platform administration events.

Apply `packages/database/drizzle/0005_add_organizations.sql` after the existing migrations.

## Authorization

- Owner: organization settings, invitations, roles, members, ownership transfer, and billing.
- Admin: organization settings plus regular-member invitation/removal.
- Billing: shared billing only.
- Member: organization usage and read access to the member dashboard.
- Platform `admin`/`super_admin`: read-only organization, membership, usage, subscription, and audit oversight under `/admin`.

All mutations are server actions or route handlers that resolve the authenticated profile and membership again. UI visibility is convenience only and is not an authorization boundary.

## Invitations

An invite can be accepted only by a signed-in profile whose normalized email matches the invitation email. Acceptance creates the membership, consumes the invitation, selects the organization, and records an audit event in one transaction.

Set the optional `MAKE_ORGANIZATION_INVITE_WEBHOOK_URL` environment variable to deliver invitation emails. Its JSON body contains `email`, `organization_name`, `role`, and `invite_url`. If it is absent or delivery fails, the organization UI displays the secure URL for manual sharing.

## Billing and usage

When an organization is active:

1. Checkout and portal access require the `owner` or `billing` role.
2. Stripe subscription metadata includes `organizationId` and the initiating `userId`.
3. Webhooks upsert `organization_subscriptions` and record an organization audit event.
4. Optimization requests are stamped with the organization ID.
5. Quota checks aggregate all organization requests for the subscription period.
6. The organization dashboard reports both shared totals and per-member usage.

Switching to the individual account restores the original individual subscription and counts only requests whose `organization_id` is null.
