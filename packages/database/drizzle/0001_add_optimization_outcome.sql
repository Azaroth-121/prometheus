-- Adds outcome feedback capture to optimization_requests (accepted/rejected/retried).
-- Hand-written to match 0000_init.sql's own style, rather than via `drizzle-kit generate`:
-- that command has no journal to diff against (0000_init.sql was applied via a raw pg
-- client in migrate.ts, not drizzle-kit's own tracked migrate path), so it regenerates the
-- entire schema from scratch instead of a real incremental diff. This file is the real diff.
alter table optimization_requests
  add column outcome text check (outcome in ('accepted', 'rejected', 'retried')),
  add column outcome_recorded_at timestamptz;
