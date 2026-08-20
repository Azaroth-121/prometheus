import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import { optimizationRequests, plans, profiles, subscriptions, type Database } from '@prometheus/database';
import { checkUsageAgainstPlan, getCurrentPlanInfo } from './access';

/**
 * Real, disposable Postgres via Testcontainers rather than mocking Drizzle's
 * query builder -- this is the one thing standing between a user and
 * unmetered OpenAI spend (see access.ts's own doc comment), so the test has
 * to exercise the real SQL, not a mock of it.
 *
 * Builds its own Pool (rather than @prometheus/database's createDatabaseClient,
 * which doesn't expose one to close) so it can call pool.end() before
 * stopping the container -- otherwise Postgres's shutdown notice to a still-
 * open connection surfaces as an unhandled 'error' event on the pg Pool.
 */
describe('usage and plan access control', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    const dir = dirname(fileURLToPath(import.meta.url));
    const initSql = readFileSync(join(dir, '..', '..', 'database', 'drizzle', '0000_init.sql'), 'utf-8');
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    await client.query(initSql);
    await client.end();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // Truncate rather than restart the container per test -- much faster,
    // and these tables have no cross-test-relevant seed data to preserve.
    await db.execute(sql`TRUNCATE optimization_requests, subscriptions, plans, profiles CASCADE`);
  });

  async function seedUser() {
    const [user] = await db
      .insert(profiles)
      .values({ email: `user-${crypto.randomUUID()}@example.com`, passwordHash: 'hash' })
      .returning({ id: profiles.id });
    return user!.id;
  }

  async function seedPlan(overrides: Partial<typeof plans.$inferInsert> = {}) {
    const [plan] = await db
      .insert(plans)
      .values({
        name: 'Pro',
        code: `pro-${crypto.randomUUID()}`,
        monthlyPrice: '20.00',
        monthlyRequestLimit: 5,
        monthlyTokenLimit: 1000,
        maximumInputLength: 4000,
        ...overrides,
      })
      .returning();
    return plan!;
  }

  async function seedRequest(userId: string, tokens: number) {
    await db.insert(optimizationRequests).values({
      userId,
      clientRequestId: crypto.randomUUID(),
      source: 'test',
      mode: 'standard',
      promptVersion: 'v1',
      model: 'test-model',
      inputCharacterCount: 10,
      inputTokens: tokens,
      outputTokens: 0,
    });
  }

  it('allows a request under both the request and token limits', async () => {
    const userId = await seedUser();
    const plan = await seedPlan({ monthlyRequestLimit: 5, monthlyTokenLimit: 1000 });
    await seedRequest(userId, 100);

    const planInfo = { ...(await getFreePlanInfoLike()), monthlyRequestLimit: plan.monthlyRequestLimit, monthlyTokenLimit: plan.monthlyTokenLimit };
    const result = await checkUsageAgainstPlan(db, userId, planInfo);

    expect(result.allowed).toBe(true);
    expect(result.exceeded).toBeNull();
    expect(result.remainingRequests).toBe(4);
  });

  it('blocks once the request count reaches the plan limit', async () => {
    const userId = await seedUser();
    const planInfo = await planInfoWith({ monthlyRequestLimit: 2, monthlyTokenLimit: 1_000_000 });
    await seedRequest(userId, 10);
    await seedRequest(userId, 10);

    const result = await checkUsageAgainstPlan(db, userId, planInfo);

    expect(result.allowed).toBe(false);
    expect(result.exceeded).toBe('requests');
    expect(result.remainingRequests).toBe(0);
  });

  it('blocks on token usage independently of request count', async () => {
    const userId = await seedUser();
    const planInfo = await planInfoWith({ monthlyRequestLimit: 1_000, monthlyTokenLimit: 500 });
    await seedRequest(userId, 600);

    const result = await checkUsageAgainstPlan(db, userId, planInfo);

    expect(result.allowed).toBe(false);
    expect(result.exceeded).toBe('tokens');
    // Still under the request limit -- remainingRequests reflects that axis.
    expect(result.remainingRequests).toBe(999);
  });

  it('only counts requests within the current period window', async () => {
    const userId = await seedUser();
    const planInfo = await planInfoWith({ monthlyRequestLimit: 1, monthlyTokenLimit: 1_000_000 });

    // A request from well before periodStart must not count against the limit.
    await db.insert(optimizationRequests).values({
      userId,
      clientRequestId: crypto.randomUUID(),
      source: 'test',
      mode: 'standard',
      promptVersion: 'v1',
      model: 'test-model',
      inputCharacterCount: 10,
      inputTokens: 10,
      outputTokens: 0,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    });

    const result = await checkUsageAgainstPlan(db, userId, planInfo);

    expect(result.allowed).toBe(true);
  });

  it('getCurrentPlanInfo falls back to Free once a paid period has lapsed', async () => {
    const userId = await seedUser();
    await seedPlan({ code: 'free', name: 'Free', monthlyRequestLimit: 20, monthlyTokenLimit: 50_000 });
    const paidPlan = await seedPlan({ monthlyRequestLimit: 500, monthlyTokenLimit: 1_000_000 });

    await db.insert(subscriptions).values({
      userId,
      providerCustomerId: 'cust-1',
      providerSubscriptionId: `order-${crypto.randomUUID()}`,
      planId: paidPlan.id,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // lapsed
    });

    const info = await getCurrentPlanInfo(db, userId);

    expect(info.planCode).toBe('free');
  });

  it('getCurrentPlanInfo returns the active paid plan while its period is current', async () => {
    const userId = await seedUser();
    const paidPlan = await seedPlan({ code: 'business', name: 'Business', monthlyRequestLimit: 1500, monthlyTokenLimit: 3_000_000 });

    await db.insert(subscriptions).values({
      userId,
      providerCustomerId: 'cust-2',
      providerSubscriptionId: `order-${crypto.randomUUID()}`,
      planId: paidPlan.id,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    });

    const info = await getCurrentPlanInfo(db, userId);

    expect(info.planCode).toBe('business');
    expect(info.monthlyRequestLimit).toBe(1500);
  });

  async function planInfoWith(overrides: { monthlyRequestLimit: number; monthlyTokenLimit: number }) {
    return { ...(await getFreePlanInfoLike()), ...overrides };
  }

  async function getFreePlanInfoLike() {
    return {
      planCode: 'test',
      planName: 'Test',
      expiresAt: null,
      monthlyRequestLimit: 20,
      monthlyTokenLimit: 50_000,
      maximumInputLength: 2000,
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
});
