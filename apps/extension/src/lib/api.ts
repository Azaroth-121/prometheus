import type { OptimizeOutcome, OptimizeRequestBody, OptimizeResponse, UsageSummary } from '@prometheus/shared-types';
import { getAccessToken } from './session';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error('Not signed in.');
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function optimize(body: OptimizeRequestBody): Promise<OptimizeResponse> {
  const response = await authorizedFetch('/api/v1/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await response.json()) as OptimizeResponse;
}

export async function getUsage(): Promise<UsageSummary> {
  const response = await authorizedFetch('/api/v1/usage');
  return (await response.json()) as UsageSummary;
}

/** Best-effort -- a failure here should never block the user from continuing. */
export async function submitOutcome(requestId: string, outcome: OptimizeOutcome): Promise<void> {
  try {
    await authorizedFetch('/api/v1/optimize/outcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, outcome }),
    });
  } catch {
    // Feedback signal is best-effort; swallow network errors.
  }
}
