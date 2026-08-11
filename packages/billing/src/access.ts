import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsageSummary } from '@prometheus/shared-types';

export interface CurrentPlanInfo {
  planCode: string;
  planName: string;
  /** null for Free — Free never expires. */
  expiresAt: string | null;
  monthlyRequestLimit: number;
  monthlyTokenLimit: number;
  maximumInputLength: number;
  /** Start of the current usage-counting window (see checkUsageAgainstPlan). */
  periodStart: string;
}

const USAGE_WINDOW_DAYS = 30;

/**
 * Free is a real row in `plans`, same as every paid tier — queried here
 * rather than hardcoded, so there's exactly one source of truth for its
 * limits instead of a shadow copy that could drift from the DB.
 */
async function getFreePlanInfo(client: SupabaseClient): Promise<CurrentPlanInfo> {
  const periodStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const { data: plan } = await client
    .from('plans')
    .select('code, name, monthly_request_limit, monthly_token_limit, maximum_input_length')
    .eq('code', 'free')
    .single();

  return {
    planCode: plan?.code ?? 'free',
    planName: plan?.name ?? 'Free',
    expiresAt: null,
    monthlyRequestLimit: plan?.monthly_request_limit ?? 20,
    monthlyTokenLimit: plan?.monthly_token_limit ?? 50_000,
    maximumInputLength: plan?.maximum_input_length ?? 2000,
    periodStart: periodStart.toISOString(),
  };
}

/**
 * Resolves what the caller can currently access: their most recent paid
 * period if it hasn't lapsed, otherwise Free. There's no cron job flipping
 * anyone to "expired" — a lapsed period just isn't returned as active here.
 */
export async function getCurrentPlanInfo(
  client: SupabaseClient,
  userId: string,
): Promise<CurrentPlanInfo> {
  const { data: subscription } = await client
    .from('subscriptions')
    .select('current_period_start, current_period_end, plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription || new Date(subscription.current_period_end) <= new Date()) {
    return getFreePlanInfo(client);
  }

  const { data: plan } = await client
    .from('plans')
    .select('code, name, monthly_request_limit, monthly_token_limit, maximum_input_length')
    .eq('id', subscription.plan_id)
    .single();

  if (!plan) {
    return getFreePlanInfo(client);
  }

  return {
    planCode: plan.code,
    planName: plan.name,
    expiresAt: subscription.current_period_end,
    monthlyRequestLimit: plan.monthly_request_limit,
    monthlyTokenLimit: plan.monthly_token_limit,
    maximumInputLength: plan.maximum_input_length,
    periodStart: subscription.current_period_start,
  };
}

export interface UsageCheckResult {
  allowed: boolean;
  /** Which axis blocked the request, if any — lets the caller give a specific error. */
  exceeded: 'requests' | 'tokens' | null;
  remainingRequests: number;
}

async function getPeriodUsage(
  client: SupabaseClient,
  userId: string,
  periodStart: string,
): Promise<{ requests: number; tokens: number }> {
  const { data: rows, count } = await client
    .from('optimization_requests')
    .select('input_tokens, output_tokens', { count: 'exact' })
    .eq('user_id', userId)
    .gte('created_at', periodStart);

  const tokens = (rows ?? []).reduce(
    (sum, row) => sum + (row.input_tokens ?? 0) + (row.output_tokens ?? 0),
    0,
  );
  return { requests: count ?? 0, tokens };
}

/**
 * Server-side spend/quota control for /api/v1/optimize — every call spends
 * real OpenAI money, so this has to be enforced here, not just trusted from
 * a client. Checks both request count and token usage; counts against
 * optimization_requests (already written on every call) rather than
 * maintaining a separate counter, so there's nothing to keep in sync.
 */
export async function checkUsageAgainstPlan(
  client: SupabaseClient,
  userId: string,
  planInfo: CurrentPlanInfo,
): Promise<UsageCheckResult> {
  const usage = await getPeriodUsage(client, userId, planInfo.periodStart);

  if (usage.requests >= planInfo.monthlyRequestLimit) {
    return { allowed: false, exceeded: 'requests', remainingRequests: 0 };
  }
  if (usage.tokens >= planInfo.monthlyTokenLimit) {
    return {
      allowed: false,
      exceeded: 'tokens',
      remainingRequests: Math.max(planInfo.monthlyRequestLimit - usage.requests, 0),
    };
  }

  return {
    allowed: true,
    exceeded: null,
    remainingRequests: Math.max(planInfo.monthlyRequestLimit - usage.requests, 0),
  };
}

/** Same period/count logic as checkUsageAgainstPlan, but for display rather than allow/deny. */
export async function getUsageSummary(client: SupabaseClient, userId: string): Promise<UsageSummary> {
  const planInfo = await getCurrentPlanInfo(client, userId);
  const usage = await getPeriodUsage(client, userId, planInfo.periodStart);

  return {
    plan_code: planInfo.planCode,
    plan_name: planInfo.planName,
    expires_at: planInfo.expiresAt,
    requests_used: usage.requests,
    requests_limit: planInfo.monthlyRequestLimit,
    tokens_used: usage.tokens,
    tokens_limit: planInfo.monthlyTokenLimit,
  };
}
