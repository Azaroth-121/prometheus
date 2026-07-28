# Prometheus

A prompt-optimization Chrome extension: converts a rough request into a structured, copy-ready prompt. Prometheus never executes the underlying request — its only output is the improved prompt (plus optional upgrade notes).

Full architecture and phased build plan: [documentation/architecture/prometheus-plan.md](documentation/architecture/prometheus-plan.md). Deviations made during implementation: [documentation/architecture/implementation-notes.md](documentation/architecture/implementation-notes.md).

This repo is currently at **Phase 1: Foundation** — auth + database schema + repo scaffolding. Prompt optimization, the extension's real auth flow, billing, and the admin panel are later phases and are stubbed or absent for now.

## Structure

```text
apps/
  web/        Next.js — landing page, login/register, dashboard, /api/v1/* routes
  extension/  Chrome MV3 popup (Vite + React) — shell only until Phase 3
packages/
  shared-types/  API + DB types shared across apps
  database/      Supabase client factories + SQL migrations
  auth/          Supabase Auth wrapper + role checks
  ui/            Shared Tailwind/React components
  billing/ prompts/ validation/ analytics/   placeholders for later phases
documentation/architecture/  the plan doc + implementation notes
```

## Setup

Requires Node 20+ and pnpm.

```bash
pnpm install
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in your Supabase project's URL, anon key, and service-role key (Dashboard → Project Settings → API).

```bash
pnpm dev      # runs all apps in dev mode via Turborepo
pnpm build    # builds all apps/packages
pnpm lint      # lints all apps/packages
pnpm typecheck # typechecks all apps/packages
```

`apps/web` runs on `http://localhost:3000`. `apps/extension` builds to `apps/extension/dist` — load it unpacked via `chrome://extensions` → Developer mode → Load unpacked.

## Database

SQL migrations live under `packages/database/migrations` (added once the dev Supabase project exists — see implementation notes). Apply them via the Supabase Dashboard SQL editor or `supabase db push` after `supabase link`.
