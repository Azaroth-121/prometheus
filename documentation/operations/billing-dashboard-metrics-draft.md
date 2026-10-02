# D.4 Admin billing dashboard metrics draft

Owner: Lance. Review with Paul (billing) and Kurt (priorities and security). This is a metric specification for the post-E0 dashboard, not a live financial report.

## Current data available in the repository

- `plans.monthly_price` and `plans.currency` hold the configured monthly list price.
- `subscriptions` holds one row per provider subscription, with `user_id`, `plan_id`, status, current period dates, and `cancel_at_period_end`. Stripe webhooks update this row.
- `optimization_requests` holds request status, model, input/output tokens, `estimated_cost`, and timestamps. Successful requests populate token and cost fields when provider usage is present.
- The admin overview currently displays total users, requests today, error rate, and guardrail failure rate. It has no billing metrics.
- There is no organization key, invoice ledger, payment amount, refund amount, or cancellation event timestamp in the current schema.

## Proposed first dashboard

| Metric | Definition | Source | Label/limitation |
| --- | --- | --- | --- |
| Active paid subscriptions | Count distinct Stripe subscription IDs with status `active`, grouped by plan. Exclude free, `trialing`, `past_due`, and canceled statuses. | `subscriptions` joined to `plans` | Current snapshot, not historical revenue. |
| Listed monthly value | Sum `plans.monthly_price` for active paid subscriptions in each currency. | `subscriptions` joined to `plans` | Call this **listed monthly value**, not revenue or MRR until discounts, quantities, taxes, and billing intervals are reconciled with Stripe. |
| New subscriptions | Count subscriptions with `created_at` in the selected period, grouped by plan. | `subscriptions` | This is local row creation, not necessarily first payment. Backfills may distort it. |
| Cancellation flags | Count current rows with `cancel_at_period_end = true`. | `subscriptions` | Current snapshot only. A historical cancellation trend needs Stripe events or a new event table. |
| Estimated OpenAI cost | Sum `estimated_cost` on `succeeded` requests within the selected period. | `optimization_requests` | Estimate, not provider invoice total. Missing usage leaves cost null; each request is rounded to 4 decimal places. |
| Successful requests and token volume | Count successful requests; sum input and output tokens, grouped by day and model. | `optimization_requests` | Display how many successful requests have missing token usage. |

Use UTC for day boundaries and display the selected time zone. Provide a 7-day and 30-day view plus a custom range. Group costs by the actual `model` recorded on each request. Keep currencies separate rather than summing unlike currencies.

## Data needed before calling a figure revenue

Use Stripe invoice/payment data for collected gross amount, refunds, discounts, taxes, currency, and billing interval. Reconcile Stripe totals to local subscription records. Decide whether the executive view should show gross collections, net collections, recognized revenue, or all three; these are different measures.

## E0 and enterprise follow-up

The present schema is user-scoped. Add organization filtering only after E0 provides organization ownership and the migration is validated. Seat-based billing will also require quantity and price history; the current `plans.monthly_price` cannot represent negotiated contracts or proration.

## Questions to resolve with Paul and Kurt

1. Which Stripe account and mode are authoritative for the dashboard, and who can provide invoice/refund read access?
2. What is the exact executive definition of revenue for the first version?
3. Should `trialing` and `past_due` appear as separate subscription counts?
4. What cost source will reconcile local estimates with OpenAI billing, and how frequently?
5. What organization and seat fields will E0/C add, and which date will define an org's billing period?

## Repository references

- `packages/database/src/schema.ts`
- `apps/web/src/app/admin/page.tsx`
- `apps/web/src/app/api/webhooks/stripe/route.ts`
- `apps/web/src/app/api/v1/optimize/route.ts`
- `packages/billing/src/plans.ts`
