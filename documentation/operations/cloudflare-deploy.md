# Cloudflare deployment workflow

The GitHub workflow deploys QA after CI succeeds on `master` once the repository
variable `CLOUDFLARE_QA_READY` is `true`. It deploys the exact commit CI
checked. It also supports a manual QA run.
Production deploys only through a manual workflow run targeting `production`,
with `CLOUDFLARE_PRODUCTION_READY=true` and the protected `production`
GitHub environment. Configure required reviewers on that environment before
enabling the production variable.

Before enabling QA, replace the placeholder Hyperdrive ID in
`apps/web/wrangler.jsonc`, provision its Neon database and migrations, set
the Worker secrets, and make the QA hostname resolve. Add
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets in the `qa`
and `production` GitHub environments with the minimum Worker deployment
permissions. Set the two ready variables only after their environment setup
and smoke checks are complete.

The workflow builds on Linux, deploys the selected Worker, then checks
`/api/ready`. It does not run database migrations, rotate Worker secrets,
copy production data, change DNS, or enable the Cloudflare cron. Those steps
need separate release coordination.
