import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import {
  organizationMembers,
  organizations,
  organizationSubscriptions,
  optimizationRequests,
  plans,
  profiles,
  subscriptions,
} from '@prometheus/database';
import type { UsageSummary } from '@prometheus/shared-types';

/** The type Drizzle hands a transaction callback -- derived from `transaction`'s own signature rather than guessed, so it can't drift from whatever Drizzle actually passes. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** checkUsageAgainstPlan/getPeriodUsage run both standalone (tests, getUsageSummary) and inside withBillingScopeLock's transaction. */
type Queryable = Database | Transaction;

export interface BillingScope {
  type: 'individual' | 'organization';
  organizationId: string | null;
  organizationName: string | null;
}

export interface CurrentPlanInfo extends BillingScope {
  planCode: string;
  planName: string;
  /** null for Free - Free never expires. */
  expiresAt: string | null;
  monthlyRequestLimit: number;
  monthlyTokenLimit: number;
  maximumInputLength: number;
  /** Start of the current usage-counting window. */
  periodStart: string;
}

const USAGE_WINDOW_DAYS = 30;

/** The selected organization is re-authorized through membership on every call. */
export async function getBillingScope(db: Database, userId: string): Promise<BillingScope> {
  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(profiles)
    .innerJoin(
      organizationMembers,
      and(
        eq(organizationMembers.userId, profiles.id),
        eq(organizationMembers.organizationId, profiles.activeOrganizationId)
      )
    )
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(eq(profiles.id, userId), eq(profiles.status, 'active'), eq(organizations.status, 'active'))
    )
    .limit(1);

  return organization
    ? { type: 'organization', organizationId: organization.id, organizationName: organization.name }
    : { type: 'individual', organizationId: null, organizationName: null };
}

async function getFreePlanInfo(db: Database, scope: BillingScope): Promise<CurrentPlanInfo> {
  const periodStart = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [plan] = await db.select().from(plans).where(eq(plans.code, 'free')).limit(1);

  return {
    ...scope,
    planCode: plan?.code ?? 'free',
    planName: plan?.name ?? 'Free',
    expiresAt: null,
    monthlyRequestLimit: plan?.monthlyRequestLimit ?? 20,
    monthlyTokenLimit: plan?.monthlyTokenLimit ?? 50_000,
    maximumInputLength: plan?.maximumInputLength ?? 2000,
    periodStart: periodStart.toISOString(),
  };
}

/** Resolves the active organization's shared plan, or the user's individual plan. */
export async function getCurrentPlanInfo(db: Database, userId: string): Promise<CurrentPlanInfo> {
  const scope = await getBillingScope(db, userId);

  const [subscription] = scope.organizationId
    ? await db
        .select({
          currentPeriodStart: organizationSubscriptions.currentPeriodStart,
          currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
          planId: organizationSubscriptions.planId,
        })
        .from(organizationSubscriptions)
        .where(
          and(
            eq(organizationSubscriptions.organizationId, scope.organizationId),
            eq(organizationSubscriptions.status, 'active')
          )
        )
        .orderBy(desc(organizationSubscriptions.currentPeriodEnd))
        .limit(1)
    : await db
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
    return getFreePlanInfo(db, scope);
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);
  if (!plan) return getFreePlanInfo(db, scope);

  return {
    ...scope,
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
  exceeded: 'requests' | 'tokens' | null;
  remainingRequests: number;
}

/** Thrown inside `withBillingScopeLock`'s callback to reject the transaction and surface why. */
export class UsageLimitExceededError extends Error {
  constructor(public readonly result: UsageCheckResult) {
    super('Usage limit exceeded');
    this.name = 'UsageLimitExceededError';
  }
}

async function getPeriodUsage(
  db: Queryable,
  userId: string,
  planInfo: CurrentPlanInfo
): Promise<{ requests: number; tokens: number }> {
  const scopeCondition = planInfo.organizationId
    ? eq(optimizationRequests.organizationId, planInfo.organizationId)
    : and(eq(optimizationRequests.userId, userId), isNull(optimizationRequests.organizationId));

  const [row] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(coalesce(${optimizationRequests.inputTokens}, 0) + coalesce(${optimizationRequests.outputTokens}, 0)), 0)::int`,
    })
    .from(optimizationRequests)
    .where(and(scopeCondition, gte(optimizationRequests.createdAt, new Date(planInfo.periodStart))));

  return { requests: row?.requests ?? 0, tokens: row?.tokens ?? 0 };
}

export async function checkUsageAgainstPlan(
  db: Queryable,
  userId: string,
  planInfo: CurrentPlanInfo
): Promise<UsageCheckResult> {
  const usage = await getPeriodUsage(db, userId, planInfo);

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

export async function getUsageSummary(db: Database, userId: string): Promise<UsageSummary> {
  const planInfo = await getCurrentPlanInfo(db, userId);
  const usage = await getPeriodUsage(db, userId, planInfo);

  return {
    plan_code: planInfo.planCode,
    plan_name: planInfo.planName,
    expires_at: planInfo.expiresAt,
    requests_used: usage.requests,
    requests_limit: planInfo.monthlyRequestLimit,
    tokens_used: usage.tokens,
    tokens_limit: planInfo.monthlyTokenLimit,
    billing_scope: planInfo.type,
    organization_id: planInfo.organizationId,
    organization_name: planInfo.organizationName,
  };
}

export interface MemberUsageSummary {
  userId: string;
  email: string;
  displayName: string | null;
  requests: number;
  tokens: number;
}

/** Caller must authorize organization visibility before using this reporting helper. */
export async function getOrganizationMemberUsage(
  db: Database,
  organizationId: string,
  periodStart: string
): Promise<MemberUsageSummary[]> {
  return db
    .select({
      userId: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      requests: sql<number>`count(${optimizationRequests.id})::int`,
      tokens: sql<number>`coalesce(sum(coalesce(${optimizationRequests.inputTokens}, 0) + coalesce(${optimizationRequests.outputTokens}, 0)), 0)::int`,
    })
    .from(organizationMembers)
    .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .leftJoin(
      optimizationRequests,
      and(
        eq(optimizationRequests.userId, profiles.id),
        eq(optimizationRequests.organizationId, organizationId),
        gte(optimizationRequests.createdAt, new Date(periodStart))
      )
    )
    .where(eq(organizationMembers.organizationId, organizationId))
    .groupBy(profiles.id, profiles.email, profiles.displayName)
    .orderBy(sql`count(${optimizationRequests.id}) desc`);
}

/**
 * Closes the check-then-act race in checkUsageAgainstPlan: without this,
 * two concurrent /api/v1/optimize calls both read the same pre-insert
 * usage count and both pass. Organization-scoped usage makes this WORSE
 * than the individual case it was originally written for -- a shared pool
 * means every member of an org is a concurrent actor against the same
 * counter, not just one user's own parallel requests.
 *
 * `scopeKey` is the resource whose quota is being spent: the organization
 * id for org-scoped billing (so the whole org serializes on its shared
 * pool), or the user id for individual billing (so unrelated users never
 * contend with each other). Callers must pass `planInfo.organizationId ??
 * userId` -- see /api/v1/optimize/route.ts.
 *
 * `pg_advisory_xact_lock` serializes calls sharing a key (different keys
 * never contend) and auto-releases at transaction end -- no manual unlock,
 * no lock left held on a crash.
 *
 * `fn` receives the transaction and is expected to both call
 * `checkUsageAgainstPlan` (passing that same transaction, not `db`) and,
 * if allowed, perform whatever write "spends" the quota -- both inside the
 * lock, so nothing else can slip in between the check and the spend.
 * Throw `UsageLimitExceededError` from `fn` to reject and roll back.
 */
export async function withBillingScopeLock<T>(
  db: Database,
  scopeKey: string,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scopeKey})::bigint)`);
    return fn(tx);
  });
}
