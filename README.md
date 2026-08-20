# Prometheus

A prompt-optimization Chrome extension: converts a rough request into a structured, copy-ready prompt. Prometheus never executes the underlying request — its only output is the improved prompt (plus optional upgrade notes). A Grammarly-style inline "Improve this prompt?" button also appears directly on supported AI chat sites (ChatGPT, Claude, Gemini).

Full architecture and phased build plan: [documentation/architecture/prometheus-plan.md](documentation/architecture/prometheus-plan.md). Deviations made during implementation: [documentation/architecture/implementation-notes.md](documentation/architecture/implementation-notes.md).

## Status

Phases 1 through 5 of the plan doc are built: auth (NextAuth + self-issued extension tokens, not Supabase Auth), Drizzle/Postgres persistence (migrated off Supabase entirely), the `/api/v1/optimize` endpoint calling OpenAI directly, per-plan usage limits, PayPal Orders-based billing (one-time 30-day access grants, not recurring subscriptions), a V1 admin panel (`/admin` overview, users, requests), and the extension's popup + inline content-script UI. It's deployed and live on Azure Container Apps (see `infrastructure/bicep/`).

**Not yet launch-ready.** No automated tests existed until this pass added a real Vitest suite covering usage/spend control and content-safety guardrails — most of the plan doc's Phase 6 checklist (security review, incident-response runbook, backup-restore test, refund process) is still open. See `documentation/architecture/implementation-notes.md` for the specific deferred items (admin billing metrics, prompt management via the `prompt_configs` table, Google sign-in for the extension, Make.com orchestration).

## Structure

```text
apps/
  web/        Next.js — landing page, login/register, dashboard, admin, /api/v1/* + /api/webhooks/*
  extension/  Chrome MV3 (Vite + React) — popup, background service worker, content script
packages/
  shared-types/  API + DB types shared across apps
  database/      Drizzle schema, client factory, SQL migrations, seed script
  auth/          NextAuth wrapper, extension token issuance, role checks
  billing/       Plan/usage logic, PayPal Orders client, webhook signature verification
  prompts/       System prompt + guardrail wording (packages/validation has the enforcement logic)
  validation/    Model-output shape validation, execution-leak guardrail checks
  ui/            Shared Tailwind/React components (dark "void/glow" theme, shared with the extension popup)
  analytics/     Placeholder for later phases
infrastructure/bicep/  Azure Container Apps, Postgres Flexible Server, deployment
documentation/architecture/  the plan doc + implementation notes
```

## Setup

Requires Node 20+, pnpm, and Docker (for the Testcontainers-based billing test).

```bash
pnpm install
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in a local Postgres connection string plus the other required values (see the file's own comments for what each one does and how to generate secrets).

```bash
pnpm dev        # runs all apps in dev mode via Turborepo
pnpm build      # builds all apps/packages
pnpm lint       # lints all apps/packages
pnpm typecheck  # typechecks all apps/packages
pnpm test       # runs the Vitest suite (packages/validation, packages/billing)
```

`apps/web` runs on `http://localhost:3000`. `apps/extension` builds to `apps/extension/dist` — load it unpacked via `chrome://extensions` → Developer mode → Load unpacked. The extension's ID is pinned via `apps/extension/public/manifest.json`'s `key` field (see `apps/extension/.keys/README.md` for what generated it) — it resolves to the same ID on every machine now, not a random one per install.

## Database

Schema lives in `packages/database/src/schema.ts`; the SQL to apply it is under `packages/database/drizzle/0000_init.sql`. Apply with:

```bash
DATABASE_URL=postgres://... pnpm --filter @prometheus/database exec tsx src/migrate.ts
DATABASE_URL=postgres://... pnpm --filter @prometheus/database run db:seed  # seeds the plans table
```
