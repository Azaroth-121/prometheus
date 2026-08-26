-- Makes refresh tokens revocable. The extension's refresh JWT
-- (packages/auth/src/tokens.ts) carries a `jti` equal to a row's id here --
-- the row, not the JWT signature alone, is what makes the token valid. A
-- missing or revoked row means "no" even when the JWT itself still verifies
-- cleanly, which is what actually makes revocation possible.
create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  last_used_at timestamptz
);

create index refresh_tokens_user_id_idx on refresh_tokens (user_id);
