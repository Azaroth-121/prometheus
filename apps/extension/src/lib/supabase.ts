import { createClient } from '@supabase/supabase-js';

/**
 * Chrome storage keeps extension sessions isolated. localStorage is a fallback
 * for local preview and test environments where the extension API is absent.
 */
const chromeStorageAdapter = {
  async getItem(key: string) {
    if (!globalThis.chrome?.storage?.local) return globalThis.localStorage.getItem(key);
    const result = await globalThis.chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string) {
    if (!globalThis.chrome?.storage?.local) {
      globalThis.localStorage.setItem(key, value);
      return;
    }
    await globalThis.chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string) {
    if (!globalThis.chrome?.storage?.local) {
      globalThis.localStorage.removeItem(key);
      return;
    }
    await globalThis.chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: chromeStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);