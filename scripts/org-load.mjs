import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const baseUrl = option('--base-url', 'http://localhost:3000');
const tokensFile = option('--tokens-file');
const requestsPerUser = Number(option('--requests-per-user', '2'));
const timeoutMs = Number(option('--timeout-ms', '30000'));
const allowLive = process.argv.includes('--allow-live');

if (!tokensFile) throw new Error('--tokens-file is required');
if (!Number.isInteger(requestsPerUser) || requestsPerUser < 1 || requestsPerUser > 20) {
  throw new Error('--requests-per-user must be between 1 and 20');
}
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
  throw new Error('--timeout-ms must be between 1000 and 120000');
}

const target = new URL(baseUrl);
const local = ['localhost', '127.0.0.1'].includes(target.hostname);
const qa = target.hostname === 'prometheus-qa.soveraign.solutions';
if (!local && !qa && !allowLive) {
  throw new Error('Only localhost and the QA hostname are allowed unless --allow-live is supplied');
}
if (target.protocol !== 'https:' && !local) {
  throw new Error('Remote targets must use HTTPS');
}

const tokens = JSON.parse(await readFile(tokensFile, 'utf8'));
if (!Array.isArray(tokens) || tokens.length < 2 || tokens.length > 20 ||
    tokens.some((token) => typeof token !== 'string' || token.length === 0) ||
    new Set(tokens).size !== tokens.length) {
  throw new Error('The token file must contain 2–20 distinct bearer tokens as a JSON array');
}

async function request(path, token, body) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, target), {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, code: data.error?.code ?? data.error_code ?? null, data, ms: performance.now() - started };
  } catch (error) {
    return { status: 0, code: error instanceof Error ? error.name : 'NETWORK_ERROR', data: {}, ms: performance.now() - started };
  }
}

const preflight = await Promise.all(tokens.map((token) => request('/api/v1/usage', token)));
if (preflight.some((result) => result.status !== 200)) {
  throw new Error('Usage preflight failed for at least one token');
}
const orgId = preflight[0].data.organization_id;
if (!orgId || preflight.some((result) =>
  result.data.billing_scope !== 'organization' ||
  result.data.organization_id !== orgId ||
  result.data.requests_used !== preflight[0].data.requests_used ||
  result.data.requests_limit !== preflight[0].data.requests_limit
)) {
  throw new Error('All tokens must resolve to the same organization and shared request pool');
}

const remaining = Math.max(0, preflight[0].data.requests_limit - preflight[0].data.requests_used);
const jobs = tokens.flatMap((token, user) =>
  Array.from({ length: requestsPerUser }, (_, sequence) => ({
    token,
    user,
    sequence,
    body: {
      input: 'Write a concise project status update for a software release.',
      source: 'web_dashboard',
      mode: 'standard',
      page_context: null,
      client_request_id: randomUUID(),
    },
  }))
);
const results = await Promise.all(jobs.map(async (job) => ({
  user: job.user + 1,
  ...await request('/api/v1/optimize', job.token, job.body),
})));

const successes = results.filter((result) => result.status === 200);
const limited = results.filter((result) => result.status === 403 && result.code === 'USAGE_LIMIT_REACHED');
const other = results.filter((result) => result.status !== 200 && !limited.includes(result));
const sorted = results.map((result) => result.ms).sort((a, b) => a - b);
const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const after = await request('/api/v1/usage', tokens[0]);
const report = {
  target: target.origin,
  organizationId: orgId,
  users: tokens.length,
  attempted: jobs.length,
  remainingBefore: remaining,
  successes: successes.length,
  limitRejections: limited.length,
  other: other.map(({ user, status, code }) => ({ user, status, code })),
  latencyMs: { p50: Math.round(percentile(0.5)), p95: Math.round(percentile(0.95)), max: Math.round(sorted.at(-1)) },
  requestsUsedAfter: after.status === 200 ? after.data.requests_used : null,
};
console.log(JSON.stringify(report, null, 2));

if (other.length > 0 || successes.length > remaining ||
    (jobs.length > remaining && limited.length < jobs.length - remaining) ||
    (after.status === 200 && after.data.requests_used < preflight[0].data.requests_used + successes.length)) {
  process.exitCode = 1;
}
