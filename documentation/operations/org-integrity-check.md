# E0.6 organization data integrity check

Run `pnpm --filter @prometheus/database db:check-org-integrity` with `DATABASE_URL` pointed at the database being checked. The command is read-only and prints JSON. It exits with code 2 when it finds a violation, or code 1 if the query fails. Keep connection strings out of logs and reports.

Run it before and after any organization backfill or Cloudflare database copy. Save each JSON result securely and compare the `totals` section: profiles, individual subscriptions, and requests must not disappear; explain any increase from concurrent customer activity. A zero count in `violations` is required before the E0 exit or cutover sign-off.

The checks cover organization ownership, selected active organization membership, dangling organization references on requests, and invalid subscription periods. They deliberately do not require every profile to belong to an organization: individual accounts still exist. They also do not treat a user's current membership as proof about historical requests, because members may leave after a request was made.

This report checks database structure and relationships. It does not prove payment amounts or that a Cloudflare copy is complete. Reconcile Stripe subscription IDs, paid plan/status, and current periods with the source database and Stripe separately before cutover.
