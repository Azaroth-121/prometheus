# @prometheus/database

Supabase clients (`browser.ts`, `server.ts`, `service-role.ts`) plus SQL migrations under `supabase/migrations/`.

## Applying migrations

Apply them in order:
1. `20260728000000_initial_schema.sql`
2. `20260729000000_add_admin_audit_reason.sql` (adds `admin_audit_logs.reason`, required by the audit trail but missing from the plan doc's section 6 schema listing)
3. `20260729000100_fix_profile_trigger_service_role.sql` (lets the service-role client change `profiles.role`/`status` — needed to bootstrap the first admin account; the original trigger only special-cased authenticated admins, not the service-role key itself)
4. `20260730000000_add_paypal_billing_columns.sql` (adds `plans.provider_plan_id`, loosens `subscriptions.provider` beyond just `'stripe'` — the build uses PayPal, not Stripe, see `packages/billing`)

Pick one:

1. **Supabase Dashboard (fastest for now)** — open your project's SQL Editor and paste the contents of the migration file, then run it.
2. **Supabase CLI** — from this package directory:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

## What it sets up

- `profiles`, `plans`, `subscriptions`, `usage_periods`, `optimization_requests`, `prompt_history`, `prompt_configs`, `admin_audit_logs`, `system_events`, `webhook_events` — matching `@prometheus/shared-types`' `db.ts` row types.
- RLS on every table: users can read their own rows (`user_id`/`id = auth.uid()`); admins (`role` in `admin`/`super_admin`, via `public.is_admin()`) can read everything. Only `profiles` allows client-side `UPDATE` (own row, non-privileged fields — role/status changes are blocked by trigger unless the actor is an admin).
- A trigger on `auth.users` (`handle_new_user`) creates the matching `profiles` row on sign-up.
- `plans`, `subscriptions`, `usage_periods`, `optimization_requests`, etc. are written by server-side code using the service-role client (`service-role.ts`), which bypasses RLS — no client-side INSERT/UPDATE policies exist for them by design.

Seeding `plans` and wiring Stripe are Phase 4 (see `documentation/architecture/prometheus-plan.md` section 9). `prompt_configs` management UI is Phase 5.
