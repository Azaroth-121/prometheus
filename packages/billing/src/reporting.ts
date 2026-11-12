import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { optimizationRequests, plans, profiles, subscriptions } from '@prometheus/database';

/**
 * Prep work for the Steven/HubSpot usage-signal ask (Nov 15 relaunch): per-user
 * last-used + frequency, not the org rollups access.ts's getOrganizationMemberUsage
 * already does. Deliberately NOT scoped to "trial" yet -- what counts as a 30-day
 * trial subscriber isn't decided (see the launch queue, P1-1); this returns every
 * individual user and lets the caller filter once that's answered, rather than
 * guessing a definition into the query now.
 */
export interface UserActivitySummary {
  userId: string;
  email: string;
  displayName: string | null;
  signedUpAt: string;
  planCode: string;
  /** null = never made a single optimize request. */
  lastUsedAt: string | null;
  requestsLast30Days: number;
  requestsLast7Days: number;
}

export async function getUserActivitySummary(db: Database): Promise<UserActivitySummary[]> {
  const rows = await db
    .select({
      userId: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      signedUpAt: profiles.createdAt,
      planCode: sql<string>`coalesce(${plans.code}, 'free')`,
      lastUsedAt: sql<string | null>`max(${optimizationRequests.createdAt})`,
      requestsLast30Days: sql<number>`count(*) filter (where ${optimizationRequests.createdAt} >= now() - interval '30 days')::int`,
      requestsLast7Days: sql<number>`count(*) filter (where ${optimizationRequests.createdAt} >= now() - interval '7 days')::int`,
    })
    .from(profiles)
    .leftJoin(optimizationRequests, eq(optimizationRequests.userId, profiles.id))
    // Current active paid subscription if any -- same "active, not yet lapsed" rule
    // access.ts's getCurrentPlanInfo uses, simplified since this is read-only
    // reporting, not something a request has to pass/fail against.
    .leftJoin(
      subscriptions,
      sql`${subscriptions.id} = (
        select s.id from subscriptions s
        where s.user_id = ${profiles.id} and s.status = 'active' and s.current_period_end > now()
        order by s.current_period_end desc limit 1
      )`
    )
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(profiles.status, 'active'))
    .groupBy(profiles.id, profiles.email, profiles.displayName, profiles.createdAt, plans.code)
    .orderBy(desc(sql`max(${optimizationRequests.createdAt})`));

  return rows.map((row) => ({
    ...row,
    signedUpAt: row.signedUpAt.toISOString(),
    lastUsedAt: row.lastUsedAt,
  }));
}
