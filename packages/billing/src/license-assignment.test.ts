import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import {
  adminAuditLogs,
  organizationMembers,
  organizations,
  organizationSubscriptions,
  plans,
  profiles,
  type Database,
} from '@prometheus/database';
import { assignLicense, getLicenseSummary, hasOrganizationLicense, LicenseError, reassignLicense, removeLicense } from './licenses';

/**
 * Same real-Postgres setup as access.test.ts: the cap on assigned licenses is
 * enforced by a transaction and an advisory lock, which only a real database
 * can exercise.
 */
describe('organization license assignment', () => {
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
    await db.execute(sql`TRUNCATE admin_audit_logs, organization_subscriptions, organization_members, organizations, plans, profiles CASCADE`);
  });

  async function seedUser() {
    const [user] = await db
      .insert(profiles)
      .values({ email: `user-${crypto.randomUUID()}@example.com`, passwordHash: 'hash' })
      .returning({ id: profiles.id });
    return user!.id;
  }

  /** An organization with an owner and `memberCount` members, none of them licensed. */
  async function seedOrganization(memberCount: number, purchased: number | null) {
    const ownerId = await seedUser();
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Test Org', slug: `test-${crypto.randomUUID()}`, createdBy: ownerId })
      .returning();
    const memberUserIds = await Promise.all(Array.from({ length: memberCount }, () => seedUser()));
    const members = await db
      .insert(organizationMembers)
      .values([
        { organizationId: organization!.id, userId: ownerId, role: 'owner' as const },
        ...memberUserIds.map((userId) => ({ organizationId: organization!.id, userId, role: 'member' as const })),
      ])
      .returning({ id: organizationMembers.id, userId: organizationMembers.userId });

    if (purchased !== null) {
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
        status: 'active',
        seatQuantity: purchased,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      });
    }

    return { organizationId: organization!.id, ownerId, members };
  }

  function change(organizationId: string, actorId: string, memberId: string) {
    return { organizationId, actorId, memberId, ipAddress: null };
  }

  it('reports purchased, assigned and available', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(2, 5);
    await assignLicense(db, change(organizationId, ownerId, members[1]!.id));

    const summary = await getLicenseSummary(db, organizationId);

    expect(summary).toMatchObject({ purchased: 5, assigned: 1, available: 4, overBy: 0 });
    expect(summary.providerSubscriptionId).toMatch(/^sub_/);
  });

  it('treats an organization without a paid subscription as having no licenses', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(1, null);

    expect(await getLicenseSummary(db, organizationId)).toMatchObject({ purchased: 0, available: 0 });
    await expect(assignLicense(db, change(organizationId, ownerId, members[1]!.id))).rejects.toThrow('Buy licenses');
  });

  it('assigns a license and records it in the audit log', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(1, 2);
    const member = members[1]!;

    await assignLicense(db, change(organizationId, ownerId, member.id));

    expect(await hasOrganizationLicense(db, organizationId, member.userId)).toBe(true);
    const [event] = await db
      .select()
      .from(adminAuditLogs)
      .where(and(eq(adminAuditLogs.organizationId, organizationId), eq(adminAuditLogs.action, 'assign_organization_license')));
    expect(event?.targetId).toBe(member.id);
  });

  it('never assigns more licenses than were purchased', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(2, 1);
    await assignLicense(db, change(organizationId, ownerId, members[1]!.id));

    await expect(assignLicense(db, change(organizationId, ownerId, members[2]!.id))).rejects.toThrow(LicenseError);
    expect((await getLicenseSummary(db, organizationId)).assigned).toBe(1);
  });

  it('a concurrent burst of assignments never exceeds the purchased count', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(6, 2);

    const results = await Promise.allSettled(
      members.slice(1).map((member) => assignLicense(db, change(organizationId, ownerId, member.id)))
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect((await getLicenseSummary(db, organizationId)).assigned).toBe(2);
  });

  it('removing a license returns it to the pool and keeps the membership', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(1, 1);
    const member = members[1]!;
    await assignLicense(db, change(organizationId, ownerId, member.id));

    await removeLicense(db, change(organizationId, ownerId, member.id));

    expect(await getLicenseSummary(db, organizationId)).toMatchObject({ assigned: 0, available: 1 });
    const [stillMember] = await db.select().from(organizationMembers).where(eq(organizationMembers.id, member.id));
    expect(stillMember).toBeDefined();
  });

  it('reassigns a license even when every license is in use', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(2, 1);
    const [, from, to] = members;
    await assignLicense(db, change(organizationId, ownerId, from!.id));

    await reassignLicense(db, { organizationId, actorId: ownerId, fromMemberId: from!.id, toMemberId: to!.id, ipAddress: null });

    expect(await hasOrganizationLicense(db, organizationId, from!.userId)).toBe(false);
    expect(await hasOrganizationLicense(db, organizationId, to!.userId)).toBe(true);
  });

  it('rejects a reassignment from a member without a license', async () => {
    const { organizationId, ownerId, members } = await seedOrganization(2, 2);

    await expect(
      reassignLicense(db, { organizationId, actorId: ownerId, fromMemberId: members[1]!.id, toMemberId: members[2]!.id, ipAddress: null })
    ).rejects.toThrow('no license to move');
  });

  it('reports members over the purchased count without unassigning anyone', async () => {
    const { organizationId, members } = await seedOrganization(2, 1);
    await db
      .update(organizationMembers)
      .set({ licenseAssignedAt: new Date() })
      .where(eq(organizationMembers.organizationId, organizationId));

    expect(await getLicenseSummary(db, organizationId)).toMatchObject({ purchased: 1, assigned: 3, available: 0, overBy: 2 });
    expect(await hasOrganizationLicense(db, organizationId, members[2]!.userId)).toBe(true);
  });

  it('cannot touch a member of a different organization', async () => {
    const first = await seedOrganization(0, 2);
    const second = await seedOrganization(1, 2);

    await expect(assignLicense(db, change(first.organizationId, first.ownerId, second.members[1]!.id))).rejects.toThrow(
      'not a member of this organization'
    );
  });
});
