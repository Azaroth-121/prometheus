import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@prometheus/database';
import { adminAuditLogs, organizationMembers, organizations, profiles, type Database } from '@prometheus/database';
import { getActiveOrganization, getUserOrganizations } from './organization';
import { OrganizationStatusError, setOrganizationStatus, type OrganizationStatusChange } from './organization-status';

/** Real Postgres, like tokens.test.ts: the change and its audit row must commit together. */
describe('organization suspension', () => {
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
    await db.execute(sql`TRUNCATE admin_audit_logs, organization_members, organizations, profiles CASCADE`);
  });

  async function seed() {
    const [admin] = await db
      .insert(profiles)
      .values({ email: `admin-${crypto.randomUUID()}@example.com`, passwordHash: 'hash', role: 'admin' })
      .returning({ id: profiles.id });
    const [owner] = await db
      .insert(profiles)
      .values({ email: `owner-${crypto.randomUUID()}@example.com`, passwordHash: 'hash' })
      .returning({ id: profiles.id });
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Acme', slug: `acme-${crypto.randomUUID()}`, createdBy: owner!.id })
      .returning({ id: organizations.id });
    await db.insert(organizationMembers).values({ organizationId: organization!.id, userId: owner!.id, role: 'owner' });
    await db.update(profiles).set({ activeOrganizationId: organization!.id }).where(eq(profiles.id, owner!.id));
    return { adminId: admin!.id, ownerId: owner!.id, organizationId: organization!.id };
  }

  function change(ids: { adminId: string; organizationId: string }, nextStatus: OrganizationStatusChange['nextStatus'], reason = 'Chargeback fraud') {
    return { organizationId: ids.organizationId, nextStatus, actorId: ids.adminId, reason, ipAddress: '203.0.113.7' };
  }

  it('suspends an organization and records who, why and from where', async () => {
    const ids = await seed();

    expect(await setOrganizationStatus(db, change(ids, 'suspended'))).toBe(true);

    const [organization] = await db.select().from(organizations).where(eq(organizations.id, ids.organizationId));
    expect(organization!.status).toBe('suspended');
    const [audit] = await db.select().from(adminAuditLogs);
    expect(audit).toMatchObject({
      adminUserId: ids.adminId,
      organizationId: ids.organizationId,
      action: 'set_organization_status',
      targetType: 'organization',
      targetId: ids.organizationId,
      beforeState: { status: 'active' },
      afterState: { status: 'suspended' },
      ipAddress: '203.0.113.7',
      reason: 'Chargeback fraud',
    });
  });

  it('takes a suspended organization out of its members\' reach, and back on reactivation', async () => {
    const ids = await seed();

    await setOrganizationStatus(db, change(ids, 'suspended'));
    expect(await getUserOrganizations(db, ids.ownerId)).toEqual([]);
    expect(await getActiveOrganization(db, ids.ownerId)).toBeNull();

    await setOrganizationStatus(db, change(ids, 'active', 'Resolved with the customer'));
    expect((await getActiveOrganization(db, ids.ownerId))?.id).toBe(ids.organizationId);
    expect(await db.select().from(adminAuditLogs)).toHaveLength(2);
  });

  it('writes nothing when the status is already the requested one', async () => {
    const ids = await seed();

    expect(await setOrganizationStatus(db, change(ids, 'active'))).toBe(false);
    expect(await db.select().from(adminAuditLogs)).toHaveLength(0);
  });

  it('requires a reason and rejects unknown statuses', async () => {
    const ids = await seed();

    await expect(setOrganizationStatus(db, change(ids, 'suspended', '   '))).rejects.toThrow('A reason is required.');
    await expect(setOrganizationStatus(db, change(ids, 'suspended', 'x'.repeat(501)))).rejects.toThrow(OrganizationStatusError);
    await expect(
      setOrganizationStatus(db, { ...change(ids, 'suspended'), nextStatus: 'deleted' as never })
    ).rejects.toThrow('Unknown organization status.');
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, ids.organizationId));
    expect(organization!.status).toBe('active');
  });

  it('rejects an organization that does not exist', async () => {
    const ids = await seed();

    await expect(setOrganizationStatus(db, change({ ...ids, organizationId: crypto.randomUUID() }, 'suspended'))).rejects.toThrow(
      'Organization not found.'
    );
    await expect(setOrganizationStatus(db, change({ ...ids, organizationId: 'not-a-uuid' }, 'suspended'))).rejects.toThrow(
      'Organization not found.'
    );
  });
});
