import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@prometheus/database';
import { env } from '@/lib/env';

export async function createClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Called from a Server Component render, which can't set cookies.
        // Safe to ignore as long as middleware refreshes the session.
      }
    },
  });
}
