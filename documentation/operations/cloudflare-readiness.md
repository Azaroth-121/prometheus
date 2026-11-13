# Cloudflare readiness check

Use `GET /api/ready` to monitor whether the web Worker can query Postgres through
Hyperdrive. It returns HTTP 200 with `{"status":"ready"}` after `select 1`, or
HTTP 503 with `{"status":"unavailable"}` when the database path fails. The
response does not expose connection details and is never cached.

`GET /api/health` remains a lightweight liveness check for the web process.
It does not check Postgres and should not be used as the only signal for
Cloudflare or Neon availability.

Set up an external uptime check for each environment's `/api/ready` URL.
Alert on repeated 503 responses or timeouts. A successful response confirms
only basic database connectivity, not migrations, auth, Stripe, OpenAI, or
optimization end-to-end. Run those separately during release smoke testing.
