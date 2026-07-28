import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@prometheus/shared-types';

export async function getSession(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Loads the caller's own profile row. Relies on RLS (profiles: users can
 * only select their own row) rather than filtering by id here — this must
 * be called with a session-scoped client, never the service-role client.
 */
export async function getCurrentProfile(client: SupabaseClient): Promise<Profile | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return data as Profile;
}
