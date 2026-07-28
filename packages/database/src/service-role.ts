import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * SECURITY: only ever call this on the server, and only for operations that
 * genuinely need to cross RLS boundaries (e.g. admin actions, webhook
 * handlers). Never import this module from client components or bundle it
 * into browser/extension code — the service-role key must stay server-only.
 */
export function createSupabaseServiceRoleClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
