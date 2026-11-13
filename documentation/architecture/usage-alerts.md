# Organization usage alerts (C.5)

An organization shares one monthly pool of requests and tokens, sized by its plan times the
licenses it bought ([organization-licenses.md](organization-licenses.md)). At 100% the optimize
API blocks with `USAGE_LIMIT_REACHED`; there is no overage billing. C.5 warns people before
and when that happens.

## What happens

| Usage of the shared pool | Email to owner + billing managers | Dashboard banner | Extension |
| --- | --- | --- | --- |
| Under 80% | - | - | normal |
| 80% or more | once per usage period | amber, on Dashboard, Billing, Organization | normal |
| 100% | once per usage period | red, same pages | request refused: "Ask an owner or billing manager to add licenses or upgrade, or wait for it to reset." |

The percentage is whichever of requests or tokens is further along, since either one blocks at 100%.
Personal (individual) plans get the banner but no email.

## How it works

- `/api/v1/optimize` checks the usage counted after each request (`apps/web/src/lib/usage-alerts.ts`).
  The email goes out as the line is crossed, not from the daily cron, which is off until the
  Cloudflare cutover.
- `organization_usage_alerts` (migration `0009`) records each alert. A threshold isn't sent
  again while a row for it (or a higher one) exists since the usage period started (the Stripe
  billing period for paid plans, a rolling 30 days on Free) for a pool of the same size. Buying
  more licenses makes a new pool, so it can be alerted again when that fills up.
- A send that fails for every recipient is deleted, so the next request retries it. If
  `MAKE_USAGE_ALERT_WEBHOOK_URL` isn't set the alert is recorded without an email and a
  warning goes to `system_events` (service `usage_alerts`).

## Make.com scenario

Needs a new scenario with a custom webhook; its URL goes in `MAKE_USAGE_ALERT_WEBHOOK_URL`
(`wrangler secret put` on Cloudflare, an app setting on Azure). One POST per recipient:

```json
{
  "email": "owner@example.com",
  "display_name": "Ada",
  "organization_name": "Acme",
  "plan_name": "Business",
  "threshold": 80,
  "requests_used": 1200,
  "requests_limit": 1500,
  "tokens_used": 900000,
  "tokens_limit": 3000000,
  "resets_at": "2026-11-30T00:00:00.000Z",
  "manage_url": "https://<app>/dashboard/billing"
}
```

`resets_at` is null on Free (rolling 30 days). `threshold` is `80` or `100`.
