import { createServerClient } from '@supabase/ssr';

export interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: 'lax' | 'strict' | 'none' | boolean;
  secure?: boolean;
}

export interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options: CookieOptions }[]): void;
}

/**
 * Server-side (SSR/route-handler/middleware) Supabase client, scoped to the
 * requesting user's session. Takes a cookie adapter instead of importing
 * `next/headers` directly, so this package stays framework-agnostic —
 * callers in apps/web wire it to Next's cookies() API.
 */
export function createSupabaseServerClient(url: string, anonKey: string, cookies: CookieAdapter) {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: cookies.getAll,
      setAll: cookies.setAll,
    },
  });
}
