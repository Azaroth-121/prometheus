import { and, eq, gte, inArray } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { organizationMembers, organizationUsageAlerts, profiles } from '@prometheus/database';
import { ORGANIZATION_BILLING_ROLES } from '@prometheus/shared-types';
import { withBillingScopeLock } from './access';

/** Percent of the shared pool at which owners and billing managers are emailed (C.5). */
export const USAGE_ALERT_THRESHOLDS = [80, 100] as const;
export type UsageAlertThreshold = (typeof USAGE_ALERT_THRESHOLDS)[number];

export interface UsageAmounts {
  requests: number;
  tokens: number;
}

/**
 * The highest threshold reached by whichever of requests or tokens is
 * further along, or null below 80%. Both limits block at 100%, so either one
 * running out is worth an alert.
 */
export function usageThresholdReached(used: UsageAmounts, limits: UsageAmounts): UsageAlertThreshold | null {
  const percent = Math.max(percentOf(used.requests, limits.requests), percentOf(used.tokens, limits.tokens));
  for (const threshold of [...USAGE_ALERT_THRESHOLDS].reverse()) {
    if (percent >= threshold) return threshold;
  }
  return null;
}

function percentOf(used: number, limit: number): number {
  return limit > 0 ? (used / limit) * 100 : 0;
}

export interface UsageAlertClaimInput {
  organizationId: string;
  threshold: UsageAlertThreshold;
  /** The plan's usage-period start (CurrentPlanInfo.periodStart). */
  periodStart: Date;
  used: UsageAmounts;
}

/**
 * Records an alert about to be sent, or returns null when this threshold (or
 * a higher one) was already alerted since `periodStart` -- so each threshold
 * is emailed once per period. Free plans count a rolling 30 days, so for
 * them that means at most once per 30 days.
 *
 * Serialized per organization so two concurrent requests crossing the line
 * together can't both claim. The key differs from the optimize route's usage
 * lock, so alerts never hold up requests.
 */
export async function claimUsageAlert(db: Database, input: UsageAlertClaimInput): Promise<string | null> {
  return withBillingScopeLock(db, `usage-alert:${input.organizationId}`, async (tx) => {
    const [existing] = await tx
      .select({ id: organizationUsageAlerts.id })
      .from(organizationUsageAlerts)
      .where(
        and(
          eq(organizationUsageAlerts.organizationId, input.organizationId),
          gte(organizationUsageAlerts.threshold, input.threshold),
          gte(organizationUsageAlerts.createdAt, input.periodStart)
        )
      )
      .limit(1);
    if (existing) return null;

    const [alert] = await tx
      .insert(organizationUsageAlerts)
      .values({
        organizationId: input.organizationId,
        threshold: input.threshold,
        periodStart: input.periodStart,
        requestsUsed: input.used.requests,
        tokensUsed: input.used.tokens,
      })
      .returning({ id: organizationUsageAlerts.id });
    return alert!.id;
  });
}

export async function markUsageAlertSent(db: Database, alertId: string): Promise<void> {
  await db.update(organizationUsageAlerts).set({ sentAt: new Date() }).where(eq(organizationUsageAlerts.id, alertId));
}

/** Drops a claim whose email didn't go out, so the next request tries again. */
export async function releaseUsageAlert(db: Database, alertId: string): Promise<void> {
  await db.delete(organizationUsageAlerts).where(eq(organizationUsageAlerts.id, alertId));
}

export interface UsageAlertRecipient {
  email: string;
  displayName: string | null;
}

/** The organization's owner and billing managers -- the people who can buy more licenses or upgrade. */
export async function getUsageAlertRecipients(db: Database, organizationId: string): Promise<UsageAlertRecipient[]> {
  return db
    .select({ email: profiles.email, displayName: profiles.displayName })
    .from(organizationMembers)
    .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        inArray(organizationMembers.role, [...ORGANIZATION_BILLING_ROLES]),
        eq(profiles.status, 'active')
      )
    );
}
