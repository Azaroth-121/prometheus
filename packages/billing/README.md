# @prometheus/billing

Thin REST wrapper around PayPal's API (not Stripe — plan doc section 9 specced Stripe, but the actual build uses PayPal).

Uses the **Orders API** (one-time payments), not Subscriptions/Billing Plans — PayPal Subscriptions require a "Reference Transactions" capability most Business accounts don't have enabled by default and can't self-enable from the Developer Dashboard, which blocked checkout entirely on the live account this was built against.

- `client.ts` — OAuth2 token exchange + `createOrder`/`captureOrder`/`verifyWebhookSignature`, all taking a `PayPalConfig` (client id/secret/api base) rather than reading env vars directly, so this package stays framework-agnostic (same pattern as `@prometheus/database`).
- `plans.ts` — placeholder Free/Pro/Business/Enterprise tier definitions. Pricing is a placeholder on purpose (see plan doc section 9: don't finalize until costs/fees/margin are modeled) — every paid tier is a real charge since testing happens against a live PayPal account.
- `access.ts` — `getCurrentPlanInfo`: since payments are one-time (not auto-renewing), a paid tier grants 30 days of access; this resolves whether a user's most recent payment is still within that window, falling back to Free once it lapses. No cron job — it's just not returned as active past `current_period_end`.

See `apps/web/src/app/api/billing/checkout/route.ts` and `apps/web/src/app/dashboard/billing/success/page.tsx` for how checkout and activation are wired up, and `apps/web/src/app/api/webhooks/paypal/route.ts` for the (currently unregistered — needs a public URL) webhook.
