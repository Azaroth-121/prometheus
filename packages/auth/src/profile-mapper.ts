import type { Profile } from '@prometheus/shared-types';
import type { ProfileRow } from '@prometheus/database';

/**
 * Drizzle's inferred row type is camelCase (Drizzle convention); the rest of
 * the app (dashboard pages, admin panel, etc.) was written against the
 * Supabase-era `Profile` interface, which is snake_case (Postgres column
 * naming, returned as-is by `.from('profiles').select()`). Mapping here
 * instead of changing `Profile` itself keeps every existing call site in
 * apps/web unchanged -- the point of preserving packages/auth's public API
 * shape through this migration.
 */
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    display_name: row.displayName,
    status: row.status,
    role: row.role,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_login_at: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  };
}
