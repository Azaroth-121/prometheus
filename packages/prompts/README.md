# @prometheus/prompts

Guardrail prompt text, the OpenAI model/schema constants, and `getActivePromptConfig` — the query the optimize route (`apps/web/src/app/api/v1/optimize/route.ts`) uses to resolve the live system prompt + model for a given mode.

## How prompt versioning works

The actual system prompt text is **not** in this package's source anymore for live traffic — it's stored in the `prompt_configs` table (`packages/database/src/schema.ts`), one row per mode (`standard` / `image` / `code`). At most one row per mode may have `status = 'published'` at a time (enforced by a partial unique index, `packages/database/drizzle/0002_activate_prompt_versioning.sql`); that's the row `getActivePromptConfig` returns. `guardrails.ts`'s `buildSystemPrompt()`/`PROMETHEUS_PROMPT_VERSION` still exist as the historical source the initial rows were seeded from, but nothing in the live request path calls them anymore.

`PROMETHEUS_OUTPUT_JSON_SCHEMA` (`model.ts`) is unaffected by versioning — it defines the OpenAI Structured Outputs response shape (`PrometheusModelOutput`), not prompt wording, and stays a static code constant across all versions.

## Publishing a new prompt version

No admin UI yet — do this directly against Postgres (locally against docker-compose Postgres first; against live Azure Postgres via the usual temporary-firewall-rule + `DATABASE_URL` process).

1. Insert the new version as a draft:
   ```sql
   insert into prompt_configs (name, version, system_prompt, model, status, created_by)
   values ('standard', 'v1.1', '...new prompt text...', 'gpt-4o-mini', 'draft',
           (select id from profiles where role in ('admin', 'super_admin') order by created_at asc limit 1));
   ```
2. Review it however you like (there's no preview UI — read the row back, or point a local dev server's `DATABASE_URL` at a copy of the DB).
3. Promote it in one transaction (the partial unique index means only one of these can hold `status = 'published'` per `name`, so do the archive and the publish together):
   ```sql
   begin;
   update prompt_configs set status = 'archived' where name = 'standard' and status = 'published';
   update prompt_configs set status = 'published', published_at = now() where name = 'standard' and version = 'v1.1';
   commit;
   ```
4. The next `/api/v1/optimize` request for that mode picks it up immediately — `getActivePromptConfig` reads fresh on every call, no caching, no redeploy needed.

If a mode ever has no published row (e.g. archived without a replacement published in the same transaction), the optimize route fails loud with a 500 rather than silently falling back to old code-level defaults — republish to restore it.
