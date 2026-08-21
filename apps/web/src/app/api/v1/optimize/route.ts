import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import {
  USER_ROLES,
  type OptimizeErrorResponse,
  type OptimizeRequestBody,
  type OptimizeSuccessResponse,
} from '@prometheus/shared-types';
import { requireRole, verifyAccessToken, toProfile } from '@prometheus/auth';
import { profiles, optimizationRequests, systemEvents } from '@prometheus/database';
import { checkUsageAgainstPlan, getCurrentPlanInfo } from '@prometheus/billing';
import { getActivePromptConfig, PROMETHEUS_OUTPUT_JSON_SCHEMA } from '@prometheus/prompts';
import { checkExecutionLeak, validateModelOutput, GuardrailValidationError } from '@prometheus/validation';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

// Approximate gpt-4o-mini rates — validate against current OpenAI pricing before relying on this for real billing.
const PRICE_PER_1K_INPUT_TOKENS = 0.00015;
const PRICE_PER_1K_OUTPUT_TOKENS = 0.0006;

/**
 * Calls OpenAI directly (Make.com is an explicitly replaceable orchestrator
 * per plan doc section 8 — no scenario exists yet, so this is the
 * synchronous V1 path). Swapping in a real Make.com scenario later only
 * changes what happens inside this handler, not the request/response
 * contract in @prometheus/shared-types.
 *
 * Bearer token is now this app's own self-issued JWT (see
 * @prometheus/auth's tokens.ts) instead of a Supabase access token — the
 * extension gets one from POST /api/v1/auth/token after signing in.
 */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!accessToken) {
    return respondError(requestId, 401, 'UNAUTHENTICATED', 'Missing bearer token.');
  }

  const userId = verifyAccessToken(accessToken, env.extensionJwtSecret);
  if (!userId) {
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

  const [profileRow] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profileRow) {
    return respondError(requestId, 401, 'UNAUTHENTICATED', 'No profile found for this session.');
  }
  const profile = toProfile(profileRow);

  try {
    requireRole(profile, USER_ROLES);
  } catch {
    return respondError(requestId, 403, 'ACCOUNT_INACTIVE', 'This account is not active.');
  }

  const planInfo = await getCurrentPlanInfo(db, profile.id);

  if (body.input.length > planInfo.maximumInputLength) {
    return respondError(
      requestId,
      400,
      'INPUT_TOO_LONG',
      `Input exceeds your plan's ${planInfo.maximumInputLength}-character limit.`
    );
  }

  const usage = await checkUsageAgainstPlan(db, profile.id, planInfo);
  if (!usage.allowed) {
    return respondError(
      requestId,
      403,
      'USAGE_LIMIT_REACHED',
      usage.exceeded === 'tokens'
        ? "Your plan's token allowance has been used for this period. Upgrade or wait for it to reset."
        : 'Your optimization allowance has been used. Upgrade or wait for it to reset.'
    );
  }

  const config = await getActivePromptConfig(db, body.mode);
  if (!config) {
    await logSystemEvent(requestId, 'error', 'prompt_config_missing', `No published prompt_configs row for mode "${body.mode}".`);
    return respondError(requestId, 500, 'UPSTREAM_ERROR', 'The optimization service is temporarily unavailable.');
  }

  try {
    await db.insert(optimizationRequests).values({
      id: requestId,
      userId: profile.id,
      clientRequestId: body.client_request_id,
      source: body.source,
      mode: body.mode,
      promptVersion: `${config.name}:${config.version}`,
      model: config.model,
      status: 'pending',
      inputCharacterCount: body.input.length,
    });
  } catch (err) {
    // 23505 = unique_violation (user_id, client_request_id) -- same
    // idempotency key already submitted.
    if (isPgUniqueViolation(err)) {
      return respondError(requestId, 409, 'INVALID_REQUEST', 'This request was already submitted.');
    }
    return respondError(requestId, 500, 'UPSTREAM_ERROR', 'Failed to record the request.');
  }

  const openai = new OpenAI({ apiKey: env.openaiApiKey });
  const startedAt = Date.now();
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: body.input },
      ],
      response_format: { type: 'json_schema', json_schema: PROMETHEUS_OUTPUT_JSON_SCHEMA },
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    await markFailed(requestId, 'UPSTREAM_ERROR', latencyMs);
    await logSystemEvent(requestId, 'error', 'openai_call_failed', String(err));
    return respondError(requestId, 502, 'UPSTREAM_ERROR', 'The optimization service is temporarily unavailable.');
  }
  const latencyMs = Date.now() - startedAt;

  let output;
  try {
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    output = validateModelOutput(raw);
  } catch (err) {
    const reason = err instanceof GuardrailValidationError ? err.message : 'Model output was not valid JSON.';
    await markFailed(requestId, 'GUARDRAIL_VALIDATION_FAILED', latencyMs);
    await logSystemEvent(requestId, 'warning', 'guardrail_validation_failed', reason);
    return respondError(requestId, 502, 'GUARDRAIL_VALIDATION_FAILED', 'The generated output failed validation.');
  }

  const leakCheck = checkExecutionLeak(output);
  if (!leakCheck.valid) {
    await markFailed(requestId, 'GUARDRAIL_VALIDATION_FAILED', latencyMs);
    await logSystemEvent(requestId, 'warning', 'execution_leak_detected', leakCheck.reason ?? 'unknown');
    return respondError(requestId, 502, 'GUARDRAIL_VALIDATION_FAILED', 'The generated output failed validation.');
  }

  const inputTokens = completion.usage?.prompt_tokens ?? null;
  const outputTokens = completion.usage?.completion_tokens ?? null;
  const estimatedCost =
    inputTokens !== null && outputTokens !== null
      ? ((inputTokens / 1000) * PRICE_PER_1K_INPUT_TOKENS + (outputTokens / 1000) * PRICE_PER_1K_OUTPUT_TOKENS).toFixed(4)
      : null;

  await db
    .update(optimizationRequests)
    .set({
      status: 'succeeded',
      inputTokens,
      outputTokens,
      estimatedCost,
      latencyMs,
      completedAt: new Date(),
    })
    .where(eq(optimizationRequests.id, requestId));

  return NextResponse.json<OptimizeSuccessResponse>({
    request_id: requestId,
    optimized_prompt: output.improved_prompt,
    upgrade_notes: output.upgrade_notes,
    usage: { remaining_requests: Math.max(usage.remainingRequests - 1, 0) },
  });
}

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

async function markFailed(requestId: string, errorCode: string, latencyMs: number) {
  await db
    .update(optimizationRequests)
    .set({ status: 'failed', errorCode, latencyMs, completedAt: new Date() })
    .where(eq(optimizationRequests.id, requestId));
}

async function logSystemEvent(requestId: string, severity: 'warning' | 'error', eventType: string, message: string) {
  await db.insert(systemEvents).values({
    requestId,
    service: 'optimize_api',
    severity,
    eventType,
    message,
  });
}

function respondError(requestId: string, status: number, code: OptimizeErrorResponse['error']['code'], message: string) {
  return NextResponse.json<OptimizeErrorResponse>({ request_id: requestId, error: { code, message } }, { status });
}
