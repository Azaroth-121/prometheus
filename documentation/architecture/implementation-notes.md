# Implementation notes — deviations & decisions

Tracks where the actual build diverges from `prometheus-plan.md` or adds decisions the original doc left open. Update this as later phases make further calls.

## Phase 1 decisions

- **Monorepo tooling**: pnpm workspaces + Turborepo (plan doc didn't specify a tool).
- **`apps/api`**: folded into `apps/web` as Next.js API routes for V1, instead of a separate app under `apps/api` (section 19 lists it separately). Rationale: one deploy target while the team is small; the `/api/v1/optimize` contract (section 5.2) is unchanged, so splitting it into its own app later is a routing change, not a rewrite.
- **GitHub account**: repo is tied to the `Azaroth-121` GitHub account (not the account gh CLI was originally authenticated as).
- **Supabase account boundary**: to avoid putting credentials in chat history, the dev Supabase project is created directly in the Supabase Dashboard by the project owner. Only three values ever get shared for local dev: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, pasted into a gitignored `.env.local` — not the account login itself.
- **SQL migrations**: deferred until the dev Supabase project exists (see "Outstanding" below) — everything else in Phase 1 doesn't require a live project.

Phase 1 exit condition (section 16: *"A test user can register, sign in, and access a protected dashboard"*) is met and verified against the live Supabase project.

## Phase 2/3/5 decisions (optimize backend, admin dashboard V1, extension UI)

- **Make.com skipped for V1**: `/api/v1/optimize` calls OpenAI directly from the Next.js route handler instead of through a Make.com scenario. Section 8 explicitly designs Make.com as a replaceable orchestrator, and no scenario exists yet — the request/response contract in `packages/shared-types/src/api.ts` is unchanged, so wiring in a real Make.com scenario later is a routing change inside the handler, not a rewrite.
- **Guardrail system prompt is a first draft**: the plan doc references "the supplied Prometheus guardrails" as something that already exists outside the repo — it was never actually supplied. `packages/prompts/src/guardrails.ts` (`prometheus-core-v1.0`) is a reasonable starting implementation of the section 7 hierarchy, not a transcription of prior material. Review/tune the wording before relying on it in production.
- **Usage limits are a placeholder**: no `plans`/`subscriptions` exist yet (Phase 4), so `usage.remaining_requests` is a hardcoded constant (`999_999`) and `MAX_INPUT_LENGTH` is a hardcoded `4000`, both in the optimize route. Replace once Phase 4 lands.
- **`prompt_configs` stays code, not DB, for now**: the system prompt lives in `packages/prompts` as TypeScript, not in the `prompt_configs` table. Admin "Prompt management" (create draft/compare/publish/rollback from section 12) needs that table actually driving the optimize route first — deferred.
- **Admin dashboard is a V1 slice of section 12**: built `/admin` (overview), `/admin/users` (search + suspend/reactivate with audit log), `/admin/requests` (sanitized request list). Deferred: revenue/billing metrics, Make-scenario status, prompt management, retry/flag-abuse actions on requests.
- **Schema gap fixed**: section 6's `admin_audit_logs` columns omitted `reason`, but section 12's audit-trail requirements explicitly need it. Added via `20260729000000_add_admin_audit_reason.sql`.
- **Trigger bug fixed**: `protect_profile_privileged_fields()` originally blocked role/status changes from the service-role client too (no `auth.uid()` outside a user session → treated as non-admin), which made it impossible to ever bootstrap the first admin account. Fixed via `20260729000100_fix_profile_trigger_service_role.sql` to only gate authenticated non-admin sessions.
- **Extension auth skips the section 5.1 handoff flow**: instead of the web-app-completes-auth → temporary-code → extension-exchanges-code ceremony, the popup has its own email/password form authenticating directly via `@prometheus/auth`, with the session stored via a custom `chrome.storage.local` adapter (not page-scriptable, unlike `localStorage`). Google sign-in and the full handoff flow are deferred.
- **Extension → API CORS**: handled via `host_permissions` in `apps/extension/public/manifest.json` (currently just `http://localhost:3000/*`) rather than CORS headers on the API route — MV3 exempts fetches to origins listed there. The production domain needs adding here before shipping.
