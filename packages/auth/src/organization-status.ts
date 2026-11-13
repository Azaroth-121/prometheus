import { eq } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { adminAuditLogs, organizations } from '@prometheus/database';

export type OrganizationStatus = 'active' | 'suspended';

export const ORGANIZATION_STATUS_REASON_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Organization ids come from URLs and forms; anything that isn't a UUID would only make Postgres throw. */
export function isOrganizationId(value: string): boolean {
  return UUID.test(value);
}

export class OrganizationStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationStatusError';
  }
}

export interface OrganizationStatusChange {
  organizationId: string;
  nextStatus: OrganizationStatus;
  /** The platform admin making the change; the caller must have authorized them. */
  actorId: string;
  reason: string;
  ipAddress: string | null;
}

/**
 * Suspends or reactivates an organization (C.4) and records it in the audit
 * log, in one transaction. A suspended organization drops out of every
 * membership check in organization.ts and getBillingScope, so it can't be
 * selected, managed or billed against. Stripe is not touched: billing keeps
 * running until an admin cancels it in Stripe.
 *
 * Returns false, writing nothing, when the organization already has that status.
 */
export async function setOrganizationStatus(db: Database, change: OrganizationStatusChange): Promise<boolean> {
  if (change.nextStatus !== 'active' && change.nextStatus !== 'suspended') {
    throw new OrganizationStatusError('Unknown organization status.');
  }
  const reason = change.reason.trim();
  if (!reason) throw new OrganizationStatusError('A reason is required.');
  if (reason.length > ORGANIZATION_STATUS_REASON_MAX) {
    throw new OrganizationStatusError(`Keep the reason under ${ORGANIZATION_STATUS_REASON_MAX} characters.`);
  }

  if (!isOrganizationId(change.organizationId)) throw new OrganizationStatusError('Organization not found.');

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, change.organizationId))
      .for('update')
      .limit(1);
    if (!organization) throw new OrganizationStatusError('Organization not found.');
    if (organization.status === change.nextStatus) return false;

    await tx
      .update(organizations)
      .set({ status: change.nextStatus, updatedAt: new Date() })
      .where(eq(organizations.id, change.organizationId));

    await tx.insert(adminAuditLogs).values({
      adminUserId: change.actorId,
      organizationId: change.organizationId,
      action: 'set_organization_status',
      targetType: 'organization',
      targetId: change.organizationId,
      beforeState: { status: organization.status },
      afterState: { status: change.nextStatus },
      ipAddress: change.ipAddress,
      reason,
    });
    return true;
  });
}
