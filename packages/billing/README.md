# @prometheus/billing

Thin REST wrapper around PayPal's API (not Stripe — plan doc section 9 specced Stripe, but the actual build uses PayPal Subscriptions).

- `client.ts` — OAuth2 token exchange + `createProduct`/`createBillingPlan`/`createSubscription`/`getSubscription`/`verifyWebhookSignature`, all taking a `PayPalConfig` (client id/secret/api base) rather than reading env vars directly, so this package stays framework-agnostic (same pattern as `@prometheus/database`).
- `plans.ts` — placeholder Free/Pro tier definitions. Pricing is a placeholder on purpose (see plan doc section 9: don't finalize until costs/fees/margin are modeled) — "Pro" is priced nominal since testing happens against a live PayPal account.

See `apps/web/src/app/api/billing/checkout/route.ts` and `apps/web/src/app/api/webhooks/paypal/route.ts` for how this gets wired up.
