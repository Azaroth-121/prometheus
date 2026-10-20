import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  adminAuditLogs,
  createDatabaseClient,
  organizationInvitations,
  organizationMembers,
  organizations,
  organizationSubscriptions,
  optimizationRequests,
  plans,
  profiles,
} from '@prometheus/database';
import type { OrganizationRole, UserRole } from '@prometheus/shared-types';
import { hashPassword } from './credentials';

const DEMO_PASSWORD = 'Prometheus123!';
const ORGANIZATION_SLUG = 'acme-demo';

const DEMO_USERS: Array<{
  email: string;
  displayName: string;
  platformRole: UserRole;
  organizationRole?: OrganizationRole;
}> = [
  { email: 'owner@prometheus.local', displayName: 'Olivia Owner', platformRole: 'user', organizationRole: 'owner' },
  { email: 'org-admin@prometheus.local', displayName: 'Avery Org Admin', platformRole: 'user', organizationRole: 'admin' },
  { email: 'member@prometheus.local', displayName: 'Morgan Member', platformRole: 'user', organizationRole: 'member' },
  { email: 'billing@prometheus.local', displayName: 'Billie Billing', platformRole: 'user', organizationRole: 'billing' },
  { email: 'user@prometheus.local', displayName: 'Uma User', platformRole: 'user' },
  { email: 'support@prometheus.local', displayName: 'Sam Support', platformRole: 'support' },
  { email: 'analyst@prometheus.local', displayName: 'Alex Analyst', platformRole: 'analyst' },
  { email: 'admin@prometheus.local', displayName: 'Parker Admin', platformRole: 'admin' },
  { email: 'superadmin@prometheus.local', displayName: 'Sasha Super Admin', platformRole: 'super_admin' },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const db = createDatabaseClient(connectionString);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds = new Map<string, string>();

  for (const demoUser of DEMO_USERS) {
    const [profile] = await db
      .insert(profiles)
      .values({
        email: demoUser.email,
        displayName: demoUser.displayName,
        role: demoUser.platformRole,
        status: 'active',
        passwordHash,
        emailVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profiles.email,
        set: {
          displayName: demoUser.displayName,
          role: demoUser.platformRole,
          status: 'active',
          passwordHash,
          emailVerifiedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: profiles.id });
    if (!profile) throw new Error(`Failed to seed ${demoUser.email}.`);
    userIds.set(demoUser.email, profile.id);
  }

  const ownerId = userIds.get('owner@prometheus.local');
  if (!ownerId) throw new Error('Demo owner was not created.');

  const [organization] = await db
    .insert(organizations)
    .values({ name: 'Acme Demo Organization', slug: ORGANIZATION_SLUG, createdBy: ownerId })
    .onConflictDoUpdate({
      target: organizations.slug,
      set: { name: 'Acme Demo Organization', status: 'active', updatedAt: new Date() },
    })
    .returning({ id: organizations.id });
  if (!organization) throw new Error('Failed to seed the demo organization.');

  for (const demoUser of DEMO_USERS) {
    const userId = userIds.get(demoUser.email)!;
    if (demoUser.organizationRole) {
      await db
        .insert(organizationMembers)
        .values({ organizationId: organization.id, userId, role: demoUser.organizationRole })
        .onConflictDoUpdate({
          target: [organizationMembers.organizationId, organizationMembers.userId],
          set: { role: demoUser.organizationRole, updatedAt: new Date() },
        });
      await db
        .update(profiles)
        .set({ activeOrganizationId: organization.id, updatedAt: new Date() })
        .where(eq(profiles.id, userId));
    } else {
      await db
        .update(profiles)
        .set({ activeOrganizationId: null, updatedAt: new Date() })
        .where(eq(profiles.id, userId));
    }
  }

  const [businessPlan] = await db.select().from(plans).where(eq(plans.code, 'business')).limit(1);
  if (!businessPlan) throw new Error('Seed the billing plans before running the demo seed.');

  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - 5);
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 25);

  await db
    .insert(organizationSubscriptions)
    .values({
      organizationId: organization.id,
      providerCustomerId: 'cus_demo_acme',
      providerSubscriptionId: 'sub_demo_acme_business',
      planId: businessPlan.id,
      status: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })
    .onConflictDoUpdate({
      target: organizationSubscriptions.providerSubscriptionId,
      set: {
        planId: businessPlan.id,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      },
    });

  const usageRows = [
    { email: 'owner@prometheus.local', request: 'demo-owner-usage', input: 180, output: 90, outcome: 'accepted' as const },
    { email: 'org-admin@prometheus.local', request: 'demo-admin-usage', input: 240, output: 120, outcome: 'accepted' as const },
    { email: 'member@prometheus.local', request: 'demo-member-usage', input: 320, output: 180, outcome: 'retried' as const },
    { email: 'billing@prometheus.local', request: 'demo-billing-usage', input: 100, output: 60, outcome: null },
  ];

  for (const row of usageRows) {
    const userId = userIds.get(row.email)!;
    await db
      .insert(optimizationRequests)
      .values({
        userId,
        organizationId: organization.id,
        clientRequestId: row.request,
        source: 'web_dashboard',
        mode: 'standard',
        promptVersion: 'standard:demo-v1',
        model: 'gpt-4o-mini',
        status: 'succeeded',
        inputCharacterCount: 400,
        inputTokens: row.input,
        outputTokens: row.output,
        estimatedCost: '0.0010',
        latencyMs: 650,
        outcome: row.outcome,
        outcomeRecordedAt: row.outcome ? new Date() : null,
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [optimizationRequests.userId, optimizationRequests.clientRequestId],
        set: {
          organizationId: organization.id,
          inputTokens: row.input,
          outputTokens: row.output,
          outcome: row.outcome,
          completedAt: new Date(),
        },
      });
  }

  const invitationToken = 'prometheus-demo-invitation-token';
  const invitationHash = createHash('sha256').update(invitationToken).digest('hex');
  const invitationExpires = new Date();
  invitationExpires.setDate(invitationExpires.getDate() + 7);
  await db
    .insert(organizationInvitations)
    .values({
      organizationId: organization.id,
      email: 'invited@prometheus.local',
      role: 'member',
      tokenHash: invitationHash,
      invitedBy: ownerId,
      expiresAt: invitationExpires,
    })
    .onConflictDoUpdate({
      target: organizationInvitations.tokenHash,
      set: { expiresAt: invitationExpires, revokedAt: null, acceptedAt: null, acceptedBy: null },
    });

  await db
    .insert(adminAuditLogs)
    .values({
      id: '00000000-0000-4000-8000-000000000001',
      adminUserId: ownerId,
      organizationId: organization.id,
      action: 'demo_seed_organization',
      targetType: 'organization',
      targetId: organization.id,
      afterState: { members: 4, plan: 'business' },
      reason: 'Local demo data',
    })
    .onConflictDoUpdate({
      target: adminAuditLogs.id,
      set: { afterState: { members: 4, plan: 'business' }, createdAt: new Date() },
    });

  console.log('Seeded Acme Demo Organization and 9 login accounts.');
  console.log(`Shared password: ${DEMO_PASSWORD}`);
  for (const demoUser of DEMO_USERS) {
    const organizationRole = demoUser.organizationRole ? ` / org:${demoUser.organizationRole}` : '';
    console.log(`${demoUser.email} - platform:${demoUser.platformRole}${organizationRole}`);
  }
  console.log(`Pending invitation: /invitations/${invitationToken}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Demo seed failed:', error);
  process.exit(1);
});
