import { createSupabaseBrowserClient } from '@prometheus/database';
import { env } from '@/lib/env';

export function createClient() {
  return createSupabaseBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
