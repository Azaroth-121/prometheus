import { createClient } from '@supabase/supabase-js';

/**
 * chrome.storage.local isn't page-scriptable (unlike localStorage), so it's
 * a reasonable session store for the popup without needing the full
 * web-app-handoff auth flow from the plan doc's section 5.1.
 */
const chromeStorageAdapter = {
  async getItem(key: string) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string) {
    await chrome.storage.local.remove(key);
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
