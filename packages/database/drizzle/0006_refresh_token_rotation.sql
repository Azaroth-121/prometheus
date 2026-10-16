-- Adds rotation lineage to refresh_tokens so a stolen-and-replayed token can
-- be detected. A token issued at login is the root of its own family
-- (family_id = id); rotating a token inherits the family_id of the token it
-- replaces, so every token descended from one login shares a family_id.
--
-- Reusing an already-rotated token (revoked_reason = 'rotated') is the
-- classic signal that someone else now holds a copy of it: the legitimate
-- client rotated it once already, so a second presentation of the same
-- now-stale token means a second holder exists. See rotateRefreshToken in
-- packages/auth/src/tokens.ts, which revokes the whole family the moment
-- that happens, forcing every session in that lineage to re-authenticate.
--
-- Existing rows get a fresh, distinct family_id per row (the column
-- default evaluates per-row on ALTER, not once for the whole table) --
-- each pre-existing token becomes the sole member of its own family, since
-- there's no way to recover its real lineage retroactively. That's the
-- correct fallback: it can still be individually revoked and reused-detected
-- against itself, just without pulling in siblings this migration can't see.
alter table refresh_tokens add column family_id uuid not null default gen_random_uuid();

create index refresh_tokens_family_id_idx on refresh_tokens (family_id);
