import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  USER_ROLES,
  type OptimizeErrorResponse,
  type OptimizeRequestBody,
  type OptimizeSuccessResponse,
} from '@prometheus/shared-types';
import { requireRole } from '@prometheus/auth';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import { buildSystemPrompt, PROMETHEUS_MODEL, PROMETHEUS_OUTPUT_JSON_SCHEMA, PROMETHEUS_PROMPT_VERSION } from '@prometheus/prompts';
import { checkExecutionLeak, validateModelOutput, GuardrailValidationError } from '@prometheus/validation';
import { env } from '@/lib/env';

// Placeholder until plans.maximum_input_length exists (Phase 4).
const MAX_INPUT_LENGTH = 4000;
// Placeholder until plans/subscriptions/usage_periods are wired up (Phase 4) — effectively unmetered until then.
const PLACEHOLDER_REMAINING_REQUESTS = 999_999;
// Approximate gpt-4o-mini rates — validate against current OpenAI pricing before relying on this for real billing.
const PRICE_PER_1K_INPUT_TOKENS = 0.00015;
const PRICE_PER_1K_OUTPUT_TOKENS = 0.0006;

/**
 * Calls OpenAI directly (Make.com is an explicitly replaceable orchestrator
 * per plan doc section 8 — no scenario exists yet, so this is the
 * synchronous V1 path). Swapping in a real Make.com scenario later only
 * changes what happens inside this handler, not the request/response
 * contract in @prometheus/shared-types.
 */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!accessToken) {
    return respondError(requestId, 401, 'UNAUTHENTICATED', 'Missing bearer token.');
  }

  const anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const { data: authData, error: authError } = await anonClient.auth.getUser(accessToken);

  if (authError || !authData.user) {
    return respondError(requestId, 401, 'UNAUTHENTICATED', 'Invalid or expired session.');
  }

  let body: OptimizeRequestBody;
  try {
    body = await request.json();
  } catch {
    return respondError(requestId, 400, 'INVALID_REQUEST', 'Malformed JSON body.');
  }

  if (!body.input || typeof body.input !== 'string') {
    return respondError(requestId, 400, 'INVALID_REQUEST', '"input" is required.');
  }
  if (!body.client_request_id || typeof body.client_request_id !== 'string') {
    return respondError(requestId, 400, 'INVALID_REQUEST', '"client_request_id" is required.');
  }
  if (body.input.length > MAX_INPUT_LENGTH) {
    return respondError(requestId, 400, 'INPUT_TOO_LONG', `Input exceeds ${MAX_INPUT_LENGTH} characters.`);
  }

  const serviceClient = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    return respondError(requestId, 401, 'UNAUTHENTICATED', 'No profile found for this session.');
  }

  try {
    requireRole(profile, USER_ROLES);
  } catch {
    return respondError(requestId, 403, 'ACCOUNT_INACTIVE', 'This account is not active.');
  }

  const { error: insertError } = await serviceClient.from('optimization_requests').insert({
    id: requestId,
    user_id: profile.id,
    client_request_id: body.client_request_id,
    source: body.source,
    mode: body.mode,
    prompt_version: PROMETHEUS_PROMPT_VERSION,
    model: PROMETHEUS_MODEL,
    status: 'pending',
    input_character_count: body.input.length,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return respondError(requestId, 409, 'INVALID_REQUEST', 'This request was already submitted.');
    }
    return respondError(requestId, 500, 'UPSTREAM_ERROR', 'Failed to record the request.');
  }

  const openai = new OpenAI({ apiKey: env.openaiApiKey });
  const startedAt = Date.now();
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: PROMETHEUS_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(body.mode) },
        { role: 'user', content: body.input },
      ],
      response_format: { type: 'json_schema', json_schema: PROMETHEUS_OUTPUT_JSON_SCHEMA },
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    await markFailed(serviceClient, requestId, 'UPSTREAM_ERROR', latencyMs);
    await logSystemEvent(serviceClient, requestId, 'error', 'openai_call_failed', String(err));
    return respondError(requestId, 502, 'UPSTREAM_ERROR', 'The optimization service is temporarily unavailable.');
  }
  const latencyMs = Date.now() - startedAt;

  let output;
  try {
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    output = validateModelOutput(raw);
  } catch (err) {
    const reason = err instanceof GuardrailValidationError ? err.message : 'Model output was not valid JSON.';
    await markFailed(serviceClient, requestId, 'GUARDRAIL_VALIDATION_FAILED', latencyMs);
    await logSystemEvent(serviceClient, requestId, 'warning', 'guardrail_validation_failed', reason);
    return respondError(requestId, 502, 'GUARDRAIL_VALIDATION_FAILED', 'The generated output failed validation.');
  }

  const leakCheck = checkExecutionLeak(output);
  if (!leakCheck.valid) {
    await markFailed(serviceClient, requestId, 'GUARDRAIL_VALIDATION_FAILED', latencyMs);
    await logSystemEvent(serviceClient, requestId, 'warning', 'execution_leak_detected', leakCheck.reason ?? 'unknown');
    return respondError(requestId, 502, 'GUARDRAIL_VALIDATION_FAILED', 'The generated output failed validation.');
  }

  const inputTokens = completion.usage?.prompt_tokens ?? null;
  const outputTokens = completion.usage?.completion_tokens ?? null;
  const estimatedCost =
    inputTokens !== null && outputTokens !== null
      ? (inputTokens / 1000) * PRICE_PER_1K_INPUT_TOKENS + (outputTokens / 1000) * PRICE_PER_1K_OUTPUT_TOKENS
      : null;

  await serviceClient
    .from('optimization_requests')
    .update({
      status: 'succeeded',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
      latency_ms: latencyMs,
      completed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  return NextResponse.json<OptimizeSuccessResponse>({
    request_id: requestId,
    optimized_prompt: output.improved_prompt,
    upgrade_notes: output.upgrade_notes,
    usage: { remaining_requests: PLACEHOLDER_REMAINING_REQUESTS },
  });
}

async function markFailed(
  client: SupabaseClient,
  requestId: string,
  errorCode: string,
  latencyMs: number,
) {
  await client
    .from('optimization_requests')
    .update({ status: 'failed', error_code: errorCode, latency_ms: latencyMs, completed_at: new Date().toISOString() })
    .eq('id', requestId);
}

async function logSystemEvent(
  client: SupabaseClient,
  requestId: string,
  severity: 'warning' | 'error',
  eventType: string,
  message: string,
) {
  await client.from('system_events').insert({
    request_id: requestId,
    service: 'optimize_api',
    severity,
    event_type: eventType,
    message,
  });
}

function respondError(
  requestId: string,
  status: number,
  code: OptimizeErrorResponse['error']['code'],
  message: string,
) {
  return NextResponse.json<OptimizeErrorResponse>(
    { request_id: requestId, error: { code, message } },
    { status },
  );
}
