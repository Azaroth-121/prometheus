import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { adminAuditLogs, organizationMembers, organizationSubscriptions } from '@prometheus/database';
import type { Queryable, Transaction } from './access';

/**
 * Bounds for how many organization licenses one checkout can buy (ADR-004,
 * documentation/architecture/organization-licenses.md). Placeholders: the
 * real minimum and the "contact sales" ceiling are an open pricing question.
 */
export const ORGANIZATION_LICENSE_MIN = 1;
export const ORGANIZATION_LICENSE_MAX = 1000;

export type LicenseQuantityResult = { ok: true; quantity: number } | { ok: false; error: string };

/**
 * Validates the license count a checkout request asks for. Individual plans
 * are always a single license; an organization checkout that omits it buys
 * the minimum, which keeps callers that predate licenses working unchanged.
 */
export function parseLicenseQuantity(value: unknown, scope: 'individual' | 'organization'): LicenseQuantityResult {
  if (value === undefined || value === null) {
    return { ok: true, quantity: scope === 'organization' ? ORGANIZATION_LICENSE_MIN : 1 };
  }

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, error: '"quantity" must be a whole number.' };
  }

  if (scope === 'individual') {
    return value === 1 ? { ok: true, quantity: 1 } : { ok: false, error: 'Individual plans include a single license.' };
  }

  if (value < ORGANIZATION_LICENSE_MIN || value > ORGANIZATION_LICENSE_MAX) {
    return {
      ok: false,
      error: `"quantity" must be between ${ORGANIZATION_LICENSE_MIN} and ${ORGANIZATION_LICENSE_MAX}.`,
    };
  }

  return { ok: true, quantity: value };
}

/** A rule a license change broke; the message is safe to show the admin. */
export class LicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseError';
  }
}

export interface LicenseSummary {
  /** From the active paid subscription; 0 for an organization on Free. */
  purchased: number;
  assigned: number;
  available: number;
  /** Members holding a license beyond what was purchased (e.g. after a reduction made in Stripe). */
  overBy: number;
  /** The active Stripe subscription, if any. */
  providerSubscriptionId: string | null;
}

export async function getLicenseSummary(db: Queryable, organizationId: string): Promise<LicenseSummary> {
  const [subscription] = await db
    .select({
      seatQuantity: organizationSubscriptions.seatQuantity,
      providerSubscriptionId: organizationSubscriptions.providerSubscriptionId,
    })
    .from(organizationSubscriptions)
    .where(
      and(
        eq(organizationSubscriptions.organizationId, organizationId),
        eq(organizationSubscriptions.status, 'active'),
        gt(organizationSubscriptions.currentPeriodEnd, new Date())
      )
    )
    .orderBy(desc(organizationSubscriptions.currentPeriodEnd))
    .limit(1);

  const [row] = await db
    .select({ assigned: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), isNotNull(organizationMembers.licenseAssignedAt)));

  const purchased = subscription?.seatQuantity ?? 0;
  const assigned = row?.assigned ?? 0;

  return {
    purchased,
    assigned,
    available: Math.max(purchased - assigned, 0),
    overBy: Math.max(assigned - purchased, 0),
    providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
  };
}

export async function hasOrganizationLicense(db: Queryable, organizationId: string, userId: string): Promise<boolean> {
  const [member] = await db
    .select({ licenseAssignedAt: organizationMembers.licenseAssignedAt })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return Boolean(member?.licenseAssignedAt);
}

/**
 * Serializes every change to an organization's licenses -- assignments and
 * purchased-count changes -- so two admins can never both take the last
 * available license. Keyed separately from withBillingScopeLock so license
 * administration never queues behind the organization's optimize traffic.
 */
export async function withLicenseLock<T>(
  db: Database,
  organizationId: string,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`licenses:${organizationId}`})::bigint)`);
    return fn(tx);
  });
}

export interface LicenseChangeInput {
  organizationId: string;
  memberId: string;
  actorId: string;
  ipAddress: string | null;
}

async function findMember(tx: Transaction, organizationId: string, memberId: string) {
  const [member] = await tx
    .select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      licenseAssignedAt: organizationMembers.licenseAssignedAt,
    })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  if (!member) throw new LicenseError('That person is not a member of this organization.');
  return member;
}

/** Gives a member one of the organization's available licenses. A no-op if they already hold one. */
export async function assignLicense(db: Database, input: LicenseChangeInput): Promise<void> {
  await withLicenseLock(db, input.organizationId, async (tx) => {
    const member = await findMember(tx, input.organizationId, input.memberId);
    if (member.licenseAssignedAt) return;

    const summary = await getLicenseSummary(tx, input.organizationId);
    if (summary.available < 1) {
      throw new LicenseError(
        summary.purchased === 0
          ? 'Buy licenses before assigning them.'
          : 'All licenses are in use. Buy more or remove one first.'
      );
    }

    await tx
      .update(organizationMembers)
      .set({ licenseAssignedAt: new Date(), updatedAt: new Date() })
      .where(eq(organizationMembers.id, member.id));
    await tx.insert(adminAuditLogs).values({
      adminUserId: input.actorId,
      organizationId: input.organizationId,
      action: 'assign_organization_license',
      targetType: 'organization_member',
      targetId: member.id,
      afterState: { userId: member.userId },
      ipAddress: input.ipAddress,
    });
  });
}

/** Returns a member's license to the pool. They stay in the organization. A no-op if they hold none. */
export async function removeLicense(db: Database, input: LicenseChangeInput): Promise<void> {
  await withLicenseLock(db, input.organizationId, async (tx) => {
    const member = await findMember(tx, input.organizationId, input.memberId);
    if (!member.licenseAssignedAt) return;

    await tx
      .update(organizationMembers)
      .set({ licenseAssignedAt: null, updatedAt: new Date() })
      .where(eq(organizationMembers.id, member.id));
    await tx.insert(adminAuditLogs).values({
      adminUserId: input.actorId,
      organizationId: input.organizationId,
      action: 'remove_organization_license',
      targetType: 'organization_member',
      targetId: member.id,
      beforeState: { userId: member.userId },
      ipAddress: input.ipAddress,
    });
  });
}

/**
 * Moves a license from one member to another in one step. The assigned count
 * doesn't change, so this works even when every license is in use.
 */
export async function reassignLicense(
  db: Database,
  input: Omit<LicenseChangeInput, 'memberId'> & { fromMemberId: string; toMemberId: string }
): Promise<void> {
  await withLicenseLock(db, input.organizationId, async (tx) => {
    const from = await findMember(tx, input.organizationId, input.fromMemberId);
    const to = await findMember(tx, input.organizationId, input.toMemberId);
    if (!from.licenseAssignedAt) throw new LicenseError('That member has no license to move.');
    if (to.licenseAssignedAt) throw new LicenseError('That member already has a license.');

    const now = new Date();
    await tx.update(organizationMembers).set({ licenseAssignedAt: null, updatedAt: now }).where(eq(organizationMembers.id, from.id));
    await tx.update(organizationMembers).set({ licenseAssignedAt: now, updatedAt: now }).where(eq(organizationMembers.id, to.id));
    await tx.insert(adminAuditLogs).values({
      adminUserId: input.actorId,
      organizationId: input.organizationId,
      action: 'reassign_organization_license',
      targetType: 'organization_member',
      targetId: to.id,
      beforeState: { userId: from.userId },
      afterState: { userId: to.userId },
      ipAddress: input.ipAddress,
    });
  });
}
