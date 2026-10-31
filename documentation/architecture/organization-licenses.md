# ADR-004: Organization licenses (C.1)

- **Status:** Proposed (draft for review)
- **Workstream:** C.1, seat-based billing
- **Owner:** Paul. **Approver:** Kurt. Pricing questions go to Charles.
- **Builds on:** [organizations.md](organizations.md) (E0, PR #6)

## Context

The Enterprise priority list makes license management part of Priority 1: an organization buys a number of licenses, an admin assigns them to members, and the portal shows purchased / assigned / available. It also asks for monthly and annual billing with volume discounts (10 / 25 / 50 / 100+ users).

Today an organization has a single shared plan and no notion of a license:

- Checkout always sends `quantity: 1` (`packages/billing/src/client.ts`).
- `organization_subscriptions` has no quantity column.
- Every member of an organization can spend the organization's shared usage pool (`checkUsageAgainstPlan` counts all requests stamped with the organization id).
- Membership size is unlimited. Nothing ties the number of members to what was paid for.

## Decision

### 1. A license is separate from membership

Membership answers "who belongs to this organization and what can they manage". A license answers "who may use Prometheus on the organization's plan". They are separate on purpose:

- Owners, admins, and billing managers can manage the organization without consuming a license.
- A member can be invited before a license is free, and assigned one later.
- Removing a license never removes the person from the organization.

### 2. Data model

- `organization_subscriptions.seat_quantity integer not null default 1`: licenses **purchased**. Written only by the Stripe webhook from the subscription item's quantity. Stripe is the source of truth.
- `organization_members.license_assigned_at timestamptz null`: the member holds a license when this is set. The database is the source of truth for **assigned**.
- **Available** = `seat_quantity` minus the count of members with a license. It is computed, never stored.
- Every assign / remove / reassign writes an `admin_audit_logs` row with the organization id. No separate history table.

A column on `organization_members` is enough because a person holds at most one license per organization (the existing unique key on organization + user guarantees it). Removing the member removes their license with the row.

### 3. Rules

- **Assign** (owner or admin): allowed only when available > 0. The count check and the update run in one transaction under the same advisory lock pattern as `withBillingScopeLock`, keyed on the organization id, so two admins cannot assign the last license at the same time.
- **Remove** (owner or admin): clears `license_assigned_at`. The license returns to the pool immediately.
- **Reassign:** remove plus assign in one transaction.
- **Cap:** the database never allows assigned > purchased. If Stripe lowers the quantity below the assigned count (for example, a change made in the Stripe Dashboard), no one is unassigned automatically: new assignments are blocked and the admin console shows "over by N" until an admin removes licenses or buys more.

### 4. Using Prometheus without a license (recommended; needs approval)

When the organization is active, `/api/v1/optimize` requires the caller to hold a license. Without one, the request is refused with a clear error ("Ask your admin for a license"), and the member can still switch to their Personal account and use their own plan. This is checked next to the existing usage check in the optimize route.

### 5. Usage limits per license

The organization keeps one shared pool, as today, sized by the number of purchased licenses: monthly request and token limits = the plan's per-user limits × `seat_quantity`. This reuses the current pooled counting and locking unchanged. Per-member limits within the pool belong to C.5.

### 6. Buying and changing licenses (Stripe)

- **First purchase:** Checkout with the chosen quantity instead of 1. The quantity comes from the request, and the server validates it against the minimum and maximum.
- **Adding licenses:** update the subscription item's quantity through the Stripe API with prorations. The new licenses are usable as soon as the webhook confirms the change.
- **Reducing licenses:** applied at the next renewal, with no refund for the current period. The request is rejected if the new quantity is lower than the number of licenses currently assigned.
- **Volume discounts:** handled by Stripe tiered pricing (volume mode) on the organization's Price, so the discount logic lives in Stripe and not in our code. Tier boundaries follow the priority list: 10 / 25 / 50 / 100+.
- **Monthly vs annual:** one Price per interval. The `plans` table gains the annual Price id. Invoicing and NET-30 terms for annual contracts belong to C.2.
- **Webhook:** `customer.subscription.created` / `updated` also stores the item quantity into `seat_quantity`.

### 7. Existing organizations

Migration: set `seat_quantity = 1` on existing rows, matching what was billed. Organizations created before this change then get a one-time grace path: all their current members are assigned licenses and the console shows them as over the cap until the owner buys enough licenses or removes some. Nobody loses access on the day of the migration.

## Prerequisites

Seat counts depend on the Stripe webhook being reliable, so the known webhook issues should be fixed first:

1. Events marked `failed` are skipped on Stripe's retry, so a missed quantity update would never be applied.
2. Checkout does not check for an existing active subscription. With licenses, a second checkout would create a second subscription with its own quantity.
3. The handler reads subscription period fields from the event payload. On newer Stripe API versions these moved, so the handler should re-fetch the subscription (which also gives the current quantity).

## Out of scope

- SSO and SCIM provisioning (Workstream A). SCIM could assign licenses automatically later through the same assign / remove functions.
- Departments and sub-groups (Priority 2).
- The admin console screens (C.3). This ADR defines the data and rules C.3 will display.

## Consequences

- Organizations can no longer give unlimited members access for one payment.
- Owners, admins, and billing managers who only manage the organization do not pay for a license.
- Purchased comes from Stripe, assigned comes from our database. The console has to handle the brief window between a Stripe change and its webhook.
- Individual subscriptions are untouched, which keeps the November relaunch path clear.

## Open questions

| # | Question | Who decides |
|---|---|---|
| 1 | Can a member without a license use Prometheus in the organization? (Recommended: no, they switch to Personal.) | Kurt / Charles |
| 2 | Price per license, monthly and annual, and the discount at each tier (10 / 25 / 50 / 100+). | Charles |
| 3 | Minimum license count for an organization plan (for example 3 or 5)? Maximum before "contact sales"? | Charles |
| 4 | Does an owner or admin who also uses Prometheus need a license? (Recommended: yes, same as any user.) | Kurt / Charles |
| 5 | Pooled usage (plan limit × licenses) or a fixed limit per person? | Kurt |
| 6 | Reductions at renewal only, or also mid-period with credit? | Charles |
| 7 | Who fixes the three webhook issues listed under Prerequisites, and when? | Kurt |
