import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import {
  optimizationRequests,
  organizationMembers,
  organizations,
  organizationSubscriptions,
  plans,
  profiles,
  type Database,
} from '@prometheus/database';
import { getCurrentPlanInfo, getOrganizationPeriodUsage, getOrganizationPlanInfo } from './access';

/** Same real-Postgres setup as access.test.ts. */
describe('organization plan lookups for platform admins', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    const dir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(dir, '..', '..', 'database', 'drizzle');
    const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    for (const file of migrationFiles) {
      await client.query(readFileSync(join(migrationsDir, file), 'utf-8'));
    }
    await client.end();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, { schema });
  }, 60_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE optimization_requests, organization_subscriptions, organization_members, organizations, plans, profiles CASCADE`
    );
    await db.insert(plans).values({
      name: 'Free',
      code: 'free',
      monthlyPrice: '0.00',
      monthlyRequestLimit: 20,
      monthlyTokenLimit: 50_000,
      maximumInputLength: 2000,
    });
  });

  async function seedOrganization(subscription: { status: 'active' | 'past_due'; seats: number } | null) {
    const [owner] = await db
      .insert(profiles)
      .values({ email: `owner-${crypto.randomUUID()}@example.com`, passwordHash: 'hash' })
      .returning({ id: profiles.id });
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Acme', slug: `acme-${crypto.randomUUID()}`, createdBy: owner!.id })
      .returning({ id: organizations.id, name: organizations.name });
    await db.insert(organizationMembers).values({ organizationId: organization!.id, userId: owner!.id, role: 'owner' });
    await db.update(profiles).set({ activeOrganizationId: organization!.id });

    if (subscription) {
      const [plan] = await db
        .insert(plans)
        .values({
          name: 'Business',
          code: `business-${crypto.randomUUID()}`,
          monthlyPrice: '50.00',
          monthlyRequestLimit: 1500,
          monthlyTokenLimit: 3_000_000,
          maximumInputLength: 4000,
        })
        .returning();
      await db.insert(organizationSubscriptions).values({
        organizationId: organization!.id,
        providerCustomerId: 'cus_test',
        providerSubscriptionId: `sub_${crypto.randomUUID()}`,
        planId: plan!.id,
        status: subscription.status,
        seatQuantity: subscription.seats,
        currentPeriodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      });
    }
    return { organization: organization!, ownerId: owner!.id };
  }

  async function addRequests(organizationId: string, userId: string, count: number, daysAgo: number) {
    await db.insert(optimizationRequests).values(
      Array.from({ length: count }, () => ({
        userId,
        organizationId,
        clientRequestId: crypto.randomUUID(),
        source: 'test',
        mode: 'standard',
        promptVersion: 'test:1',
        model: 'test',
        status: 'succeeded' as const,
        inputCharacterCount: 1,
        inputTokens: 100,
        outputTokens: 50,
        createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      }))
    );
  }

  it('matches what the organization\'s members get, license-scaled', async () => {
    const { organization, ownerId } = await seedOrganization({ status: 'active', seats: 4 });

    const info = await getOrganizationPlanInfo(db, organization);

    expect(info).toMatchObject({ type: 'organization', organizationId: organization.id, planName: 'Business', licensedSeats: 4, monthlyRequestLimit: 6000 });
    expect(info).toEqual(await getCurrentPlanInfo(db, ownerId));
  });

  it('counts usage in the current billing period only', async () => {
    const { organization, ownerId } = await seedOrganization({ status: 'active', seats: 1 });
    await addRequests(organization.id, ownerId, 3, 1);
    await addRequests(organization.id, ownerId, 2, 10);

    const info = await getOrganizationPlanInfo(db, organization);

    expect(await getOrganizationPeriodUsage(db, { ...info, organizationId: organization.id })).toEqual({ requests: 3, tokens: 450 });
  });

  it('falls back to Free limits when the subscription is past due', async () => {
    const { organization } = await seedOrganization({ status: 'past_due', seats: 3 });

    expect(await getOrganizationPlanInfo(db, organization)).toMatchObject({ planCode: 'free', licensedSeats: null, monthlyRequestLimit: 20 });
  });

  it('works for an organization with no subscription, even after it is suspended', async () => {
    const { organization, ownerId } = await seedOrganization(null);
    await addRequests(organization.id, ownerId, 2, 3);
    await db.update(organizations).set({ status: 'suspended' });

    const info = await getOrganizationPlanInfo(db, organization);

    expect(info).toMatchObject({ planCode: 'free', organizationId: organization.id });
    expect(await getOrganizationPeriodUsage(db, { ...info, organizationId: organization.id })).toEqual({ requests: 2, tokens: 300 });
  });
});
