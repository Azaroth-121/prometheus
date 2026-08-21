# @prometheus/prompts

Guardrail prompt text, the OpenAI model/schema constants, and `getActivePromptConfig` — the query the optimize route (`apps/web/src/app/api/v1/optimize/route.ts`) uses to resolve the live system prompt + model for a given mode.

## How prompt versioning works

The actual system prompt text is **not** in this package's source anymore for live traffic — it's stored in the `prompt_configs` table (`packages/database/src/schema.ts`), one row per mode (`standard` / `image` / `code`). At most one row per mode may have `status = 'published'` at a time (enforced by a partial unique index, `packages/database/drizzle/0002_activate_prompt_versioning.sql`); that's the row `getActivePromptConfig` returns. `guardrails.ts`'s `buildSystemPrompt()`/`PROMETHEUS_PROMPT_VERSION` still exist as the historical source the initial rows were seeded from, but nothing in the live request path calls them anymore.

`PROMETHEUS_OUTPUT_JSON_SCHEMA` (`model.ts`) is unaffected by versioning — it defines the OpenAI Structured Outputs response shape (`PrometheusModelOutput`), not prompt wording, and stays a static code constant across all versions.

## Publishing a new prompt version

Use the admin UI at `/admin/prompt-configs` (`apps/web/src/app/admin/prompt-configs/page.tsx` + `actions.ts`) — sign in with an admin/super_admin account. Each mode's section shows its current published version, any drafts, and a "New draft" form pre-filled with the currently-published text so you're editing, not starting blank. Saving a draft writes a `status: 'draft'` row (`createDraftPromptConfig`); clicking "Publish" on a draft archives whatever's currently published for that mode and publishes the draft, atomically (`publishPromptConfig`, wrapped in a DB transaction — the partial unique index guarantees only one `published` row per name at any moment). Every action is admin-gated independently of the `/admin` layout's own check (`requireAdmin`, defense in depth) and writes an `admin_audit_logs` row.

The next `/api/v1/optimize` request for that mode picks up a newly-published version immediately — `getActivePromptConfig` reads fresh on every call, no caching, no redeploy needed.

If a mode ever has no published row (e.g. archived without a replacement published in the same transaction), the optimize route fails loud with a 500 rather than silently falling back to old code-level defaults — publish a replacement to restore it.
