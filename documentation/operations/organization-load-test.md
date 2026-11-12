# Concurrent organization usage check

Run `node scripts/org-load.mjs --tokens-file tokens.json --base-url http://localhost:3000 --requests-per-user 2`
against a seeded local app. The token file is a JSON array of two to twenty
distinct extension access tokens for members whose active context is the same
organization. Keep it outside the repository and delete it after testing.

The script first checks `/api/v1/usage` for every token. It stops unless all
members report the same organization and shared request pool. It then sends a
simultaneous burst to `/api/v1/optimize`, using a fresh request ID for every
call. It reports successes, limit rejections, other failures, and p50/p95/max
latency. It exits nonzero if the burst exceeds the remaining shared request
allowance or produces unexpected responses.

The script allows localhost and `prometheus-qa.soveraign.solutions` by default.
Other hosts require `--allow-live`. Each accepted call uses OpenAI and counts
against the organization's plan, so use a dedicated test organization and
budget. To test the limit, leave fewer requests available than the burst size.
Run with no other traffic on that organization so the before/after comparison
has a stable baseline.

Record the target, date, member count, request count, p50/p95 latency, success
and rejection counts, and any errors with the E0 exit-gate evidence. Repeat
after Cloudflare deployment and after the seat-license changes merge.
