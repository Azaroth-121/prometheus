import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import { organizationMembers, organizations, organizationUsageAlerts, profiles, type Database } from '@prometheus/database';
import {
  claimUsageAlert,
  getUsageAlertRecipients,
  markUsageAlertSent,
  releaseUsageAlert,
  type UsageAlertThreshold,
} from './usage-alerts';

/**
 * Same real-Postgres setup as access.test.ts: "once per period" is decided by
 * a query under an advisory lock, which only a real database can exercise.
 */
describe('organization usage alert claims', () => {
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
    await db.execute(sql`TRUNCATE organization_usage_alerts, organization_members, organizations, profiles CASCADE`);
  });

  async function seedUser(status: 'active' | 'suspended' = 'active') {
    const [user] = await db
      .insert(profiles)
      .values({ email: `user-${crypto.randomUUID()}@example.com`, passwordHash: 'hash', status })
      .returning({ id: profiles.id, email: profiles.email });
    return user!;
  }

  async function seedOrganization() {
    const owner = await seedUser();
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Test Org', slug: `test-${crypto.randomUUID()}`, createdBy: owner.id })
      .returning();
    await db.insert(organizationMembers).values({ organizationId: organization!.id, userId: owner.id, role: 'owner' });
    return { organizationId: organization!.id, owner };
  }

  const periodStart = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

  function claim(organizationId: string, threshold: UsageAlertThreshold, start = periodStart()) {
    return claimUsageAlert(db, { organizationId, threshold, periodStart: start, used: { requests: 800, tokens: 0 } });
  }

  it('claims each threshold once per period', async () => {
    const { organizationId } = await seedOrganization();

    expect(await claim(organizationId, 80)).toEqual(expect.any(String));
    expect(await claim(organizationId, 80)).toBeNull();
    expect(await claim(organizationId, 100)).toEqual(expect.any(String));
    expect(await claim(organizationId, 100)).toBeNull();
  });

  it('skips 80% once 100% has been alerted', async () => {
    const { organizationId } = await seedOrganization();

    await claim(organizationId, 100);

    expect(await claim(organizationId, 80)).toBeNull();
  });

  it('alerts again in a new period', async () => {
    const { organizationId } = await seedOrganization();
    const alertId = await claim(organizationId, 80);
    await db
      .update(organizationUsageAlerts)
      .set({ createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) })
      .where(eq(organizationUsageAlerts.id, alertId!));

    expect(await claim(organizationId, 80)).toEqual(expect.any(String));
  });

  it('keeps alerts separate per organization', async () => {
    const first = await seedOrganization();
    const second = await seedOrganization();

    await claim(first.organizationId, 80);

    expect(await claim(second.organizationId, 80)).toEqual(expect.any(String));
  });

  it('lets only one of several simultaneous requests claim', async () => {
    const { organizationId } = await seedOrganization();

    const results = await Promise.all(Array.from({ length: 5 }, () => claim(organizationId, 100)));

    expect(results.filter((id) => id !== null)).toHaveLength(1);
  });

  it('can be claimed again after a failed send is released', async () => {
    const { organizationId } = await seedOrganization();
    const alertId = await claim(organizationId, 80);

    await releaseUsageAlert(db, alertId!);

    expect(await claim(organizationId, 80)).toEqual(expect.any(String));
  });

  it('records when the alert was sent', async () => {
    const { organizationId } = await seedOrganization();
    const alertId = await claim(organizationId, 80);

    await markUsageAlertSent(db, alertId!);

    const [row] = await db.select().from(organizationUsageAlerts).where(eq(organizationUsageAlerts.id, alertId!));
    expect(row!.sentAt).toBeInstanceOf(Date);
  });

  it('sends to the owner and billing managers who are active', async () => {
    const { organizationId, owner } = await seedOrganization();
    const billing = await seedUser();
    const admin = await seedUser();
    const member = await seedUser();
    const suspendedBilling = await seedUser('suspended');
    await db.insert(organizationMembers).values([
      { organizationId, userId: billing.id, role: 'billing' },
      { organizationId, userId: admin.id, role: 'admin' },
      { organizationId, userId: member.id, role: 'member' },
      { organizationId, userId: suspendedBilling.id, role: 'billing' },
    ]);

    const recipients = await getUsageAlertRecipients(db, organizationId);

    expect(recipients.map((r) => r.email).sort()).toEqual([owner.email, billing.email].sort());
  });
});
