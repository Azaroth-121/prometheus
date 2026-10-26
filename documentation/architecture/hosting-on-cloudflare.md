# Decision: move Prometheus hosting from Azure to Cloudflare

**Status:** Proposed — 2026-10-26 · requested by the sponsor (Steven Palange) · awaiting CEO
(Kurt) approval before anything is deployed.
**Full plan:** `SoverAIgn-Solutions/organizational-singularity` → `docs/migration/cloudflare.md`
(§6 covers Prometheus; OrgSing has its own ADR 0011).

## Context
Prometheus (web app + API, Next.js 15) runs as an Azure Container App inside OrgSing's Container
Apps Environment, with its own Postgres Flexible Server (Central US) and a Container Apps job for
the daily expiry reminders. The Chrome/Edge extension has that Azure URL hard-coded. The sponsor
has asked for both products to move to Cloudflare, on the SoverAIgn Cloudflare account
(`soveraign.solutions` is already on Cloudflare DNS; the account also runs the separate `osu`
Worker, which this work must not touch).

## Decision
| Concern | Azure today | Cloudflare target |
|---|---|---|
| Web + API | Container App (Node, `output: 'standalone'`) | **Worker** `prometheus-web` via `@opennextjs/cloudflare` |
| Daily expiry reminders | Container Apps job, 13:00 UTC | **Cron Trigger** `0 13 * * *` → `worker.ts` `scheduled()` → existing route |
| Postgres | Flexible Server | **PlanetScale Postgres** (billed via Cloudflare) through **Hyperdrive** |
| Secrets | app settings (`deploy.ps1`) | Worker Secrets, copied **unchanged** (except the DB password) |
| Domain | `*.azurecontainerapps.io` | a `soveraign.solutions` hostname |

## What this branch already does (no deploy)
- `wrangler.jsonc`, `open-next.config.ts`, `worker.ts` (cron entry), `public/_headers`,
  `pnpm cf:build` / `cf:preview` / `typecheck:worker` scripts.
- `src/lib/db.ts`: one Postgres client **per request** on Workers (Hyperdrive binding, keyed on the
  request's ExecutionContext, `maxUses: 1`); the existing single process pool on Node/Azure.
- `next.config.mjs`: `pg` and `pg-cloudflare` are server externals (declared as direct web
  dependencies), so the Worker bundle gets pg's real Cloudflare socket instead of the empty
  stub Next's bundler picked ("b2 is not a constructor").

## Verified (2026-10-26)
Built with OpenNext **on Linux** (the Windows build produces a broken bundle — CI must build on
Linux) and run in the local Workers runtime (`wrangler dev`) against a throwaway Postgres:

| Check | Result |
|---|---|
| Landing, login pages | 200 |
| `/dashboard` signed out | 307 → `/login` |
| Extension sign-in (bcrypt + JWT + DB via Hyperdrive) | 200 (~0.3 s); wrong password 401 |
| Usage with token; refresh; refreshed token; revoke | 200 · 200 · 200 · 200 |
| 10 sequential authenticated requests (per-request DB client) | 10 × 200 |
| Missing / malformed bearer | 401 · 401 |
| Cron Trigger → route → DB query → webhook attempt → `system_events` row | works |

The existing Node build (Azure) was re-verified the same day: typecheck, 49/49 tests, lint,
production build, and the standalone server signing in against Postgres.

## Consequences
- The extension must ship a version that calls the `soveraign.solutions` hostname **before**
  cutover (plan Phase P1), keeping the Azure URL in `host_permissions` for one release.
- **Never run `deploy.ps1` during the migration:** it regenerates the Postgres password and every
  auth/JWT/cron secret, which would sign out every user and extension.
- `sharp` (bundled by Next 15 for image optimization, 3 high advisories) is not used on Workers.
- Still to do before cutover: Hyperdrive id, secrets, Stripe webhook + return URLs on the new
  hostname, PlanetScale database and a rehearsal data copy (plan §4/§6).
