import { createBrowserClient } from '@supabase/ssr';

/**
 * Client-side Supabase client. Uses the anon key only — safe to expose to
 * the browser. RLS policies (see migrations/) are what actually protect data.
 */
export function createSupabaseBrowserClient(url: string, anonKey: string) {
  return createBrowserClient(url, anonKey);
}
