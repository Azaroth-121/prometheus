import type { OptimizeRequestBody, OptimizeResponse } from '@prometheus/shared-types';
import { supabase } from './supabase';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

export async function optimize(body: OptimizeRequestBody): Promise<OptimizeResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not signed in.');
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/optimize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as OptimizeResponse;
}
