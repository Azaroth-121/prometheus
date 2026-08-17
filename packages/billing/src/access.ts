import { eq, and, gte, desc, sql } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { plans, subscriptions, optimizationRequests } from '@prometheus/database';
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
async function getFreePlanInfo(db: Database): Promise<CurrentPlanInfo> {
  const periodStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [plan] = await db.select().from(plans).where(eq(plans.code, 'free')).limit(1);

  return {
    planCode: plan?.code ?? 'free',
    planName: plan?.name ?? 'Free',
    expiresAt: null,
    monthlyRequestLimit: plan?.monthlyRequestLimit ?? 20,
    monthlyTokenLimit: plan?.monthlyTokenLimit ?? 50_000,
    maximumInputLength: plan?.maximumInputLength ?? 2000,
    periodStart: periodStart.toISOString(),
  };
}

/**
 * Resolves what the caller can currently access: their most recent paid
 * period if it hasn't lapsed, otherwise Free. There's no cron job flipping
 * anyone to "expired" — a lapsed period just isn't returned as active here.
 */
export async function getCurrentPlanInfo(db: Database, userId: string): Promise<CurrentPlanInfo> {
  const [subscription] = await db
    .select({
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planId: subscriptions.planId,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  if (!subscription || subscription.currentPeriodEnd <= new Date()) {
    return getFreePlanInfo(db);
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);

  if (!plan) {
    return getFreePlanInfo(db);
  }

  return {
    planCode: plan.code,
    planName: plan.name,
    expiresAt: subscription.currentPeriodEnd.toISOString(),
    monthlyRequestLimit: plan.monthlyRequestLimit,
    monthlyTokenLimit: plan.monthlyTokenLimit,
    maximumInputLength: plan.maximumInputLength,
    periodStart: subscription.currentPeriodStart.toISOString(),
  };
}

export interface UsageCheckResult {
  allowed: boolean;
  /** Which axis blocked the request, if any — lets the caller give a specific error. */
  exceeded: 'requests' | 'tokens' | null;
  remainingRequests: number;
}

async function getPeriodUsage(
  db: Database,
  userId: string,
  periodStart: string
): Promise<{ requests: number; tokens: number }> {
  const [row] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(coalesce(${optimizationRequests.inputTokens}, 0) + coalesce(${optimizationRequests.outputTokens}, 0)), 0)::int`,
    })
    .from(optimizationRequests)
    .where(
      and(eq(optimizationRequests.userId, userId), gte(optimizationRequests.createdAt, new Date(periodStart)))
    );

  return { requests: row?.requests ?? 0, tokens: row?.tokens ?? 0 };
}

/**
 * Server-side spend/quota control for /api/v1/optimize — every call spends
 * real OpenAI money, so this has to be enforced here, not just trusted from
 * a client. Checks both request count and token usage; counts against
 * optimization_requests (already written on every call) rather than
 * maintaining a separate counter, so there's nothing to keep in sync.
 */
export async function checkUsageAgainstPlan(
  db: Database,
  userId: string,
  planInfo: CurrentPlanInfo
): Promise<UsageCheckResult> {
  const usage = await getPeriodUsage(db, userId, planInfo.periodStart);

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
export async function getUsageSummary(db: Database, userId: string): Promise<UsageSummary> {
  const planInfo = await getCurrentPlanInfo(db, userId);
  const usage = await getPeriodUsage(db, userId, planInfo.periodStart);

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
