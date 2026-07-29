import type { SupabaseClient } from '@supabase/supabase-js';

export interface CurrentPlanInfo {
  planCode: string;
  planName: string;
  /** null for Free — Free never expires. */
  expiresAt: string | null;
  monthlyRequestLimit: number;
  /** Start of the current usage-counting window (see checkAndConsumeUsage). */
  periodStart: string;
}

const FREE_REQUEST_LIMIT = 20;
const USAGE_WINDOW_DAYS = 30;

function freePlan(): CurrentPlanInfo {
  const periodStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    planCode: 'free',
    planName: 'Free',
    expiresAt: null,
    monthlyRequestLimit: FREE_REQUEST_LIMIT,
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
    return freePlan();
  }

  const { data: plan } = await client
    .from('plans')
    .select('code, name, monthly_request_limit')
    .eq('id', subscription.plan_id)
    .single();

  if (!plan) {
    return freePlan();
  }

  return {
    planCode: plan.code,
    planName: plan.name,
    expiresAt: subscription.current_period_end,
    monthlyRequestLimit: plan.monthly_request_limit,
    periodStart: subscription.current_period_start,
  };
}

export interface UsageCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Server-side spend/quota control for /api/v1/optimize — every call spends
 * real OpenAI money, so this has to be enforced here, not just trusted from
 * a client. Counts against optimization_requests (already written on every
 * call) rather than maintaining a separate counter, so there's nothing to
 * keep in sync.
 */
export async function checkUsageLimit(
  client: SupabaseClient,
  userId: string,
): Promise<UsageCheckResult> {
  const planInfo = await getCurrentPlanInfo(client, userId);

  const { count } = await client
    .from('optimization_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', planInfo.periodStart);

  const used = count ?? 0;
  return {
    allowed: used < planInfo.monthlyRequestLimit,
    remaining: Math.max(planInfo.monthlyRequestLimit - used, 0),
    limit: planInfo.monthlyRequestLimit,
  };
}
