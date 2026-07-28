import type { SupabaseClient } from '@supabase/supabase-js';

export interface SignUpParams {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export async function signUpWithPassword(client: SupabaseClient, params: SignUpParams) {
  return client.auth.signUp({
    email: params.email,
    password: params.password,
    options: params.displayName ? { data: { display_name: params.displayName } } : undefined,
  });
}

export async function signInWithPassword(client: SupabaseClient, params: SignInParams) {
  return client.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
}

export async function signOut(client: SupabaseClient) {
  return client.auth.signOut();
}
