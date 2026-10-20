# @prometheus/database

The application uses Drizzle ORM with plain PostgreSQL. `src/schema.ts` is the typed application schema and `drizzle/` contains the ordered SQL migrations.

## Applying migrations

Apply the Drizzle migrations in filename order:

1. `0000_init.sql`
2. `0001_add_optimization_outcome.sql`
3. `0002_activate_prompt_versioning.sql`
4. `0003_add_refresh_tokens.sql`
5. `0004_default_provider_stripe.sql`
6. `0005_add_organizations.sql`

The current helper applies one explicitly selected migration and requires `DATABASE_URL`:

~~~powershell
corepack pnpm --filter @prometheus/database run db:apply-schema 0005_add_organizations.sql
~~~

Do not re-run a migration already applied to a database; this repository does not yet maintain a migration journal.

## Organization schema

`0005_add_organizations.sql` adds organizations, memberships, expiring invitations, shared Stripe subscriptions, the profile's active organization preference, and nullable organization scope columns on optimization requests and audit logs. See `documentation/architecture/organizations.md` for the authorization and billing model.

## Development

~~~powershell
corepack pnpm --filter @prometheus/database run typecheck
corepack pnpm --filter @prometheus/database run db:seed
corepack pnpm --filter @prometheus/auth run db:seed-demo
~~~

The plan and local demo seeds are idempotent. The demo seed creates all platform and organization role variants with the local-only password printed by the command.
