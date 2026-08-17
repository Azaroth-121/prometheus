import { eq } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { profiles } from '@prometheus/database';
import type { Profile } from '@prometheus/shared-types';
import { toProfile } from './profile-mapper';

/**
 * Loads a profile by id -- the explicit-userId replacement for the old
 * RLS-backed `getCurrentProfile(supabaseClient)`. There's no more ambient
 * session to read the caller's identity from a database client itself:
 * callers resolve `userId` first (NextAuth's `auth()` session for the web
 * app, or the verified bearer JWT's `sub` claim for the extension/API
 * routes) and pass it in explicitly. This is also the app-layer replacement
 * for what RLS used to enforce automatically -- every call site that used to
 * rely on "RLS only returns my own row" now must call this with the actual
 * authenticated user's id, never a client-supplied one.
 */
export async function getCurrentProfile(db: Database, userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return row ? toProfile(row) : null;
}
