import { and, eq } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { organizationMembers, organizations, profiles } from '@prometheus/database';
import {
  canManageOrganization,
  canManageOrganizationBilling,
  type OrganizationRole,
} from '@prometheus/shared-types';
import { UnauthorizedError } from './require-role';

export interface OrganizationContext {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
}

export async function getUserOrganizations(
  db: Database,
  userId: string
): Promise<OrganizationContext[]> {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), eq(organizations.status, 'active')))
    .orderBy(organizations.name);
}

/**
 * Resolves the user's explicitly-selected organization and re-checks the
 * membership on every request. The profile column is only a preference; it
 * never grants access by itself.
 */
export async function getActiveOrganization(
  db: Database,
  userId: string
): Promise<OrganizationContext | null> {
  const [row] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
    })
    .from(profiles)
    .innerJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, profiles.activeOrganizationId),
        eq(organizationMembers.userId, profiles.id)
      )
    )
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(profiles.id, userId),
        eq(profiles.status, 'active'),
        eq(organizations.status, 'active')
      )
    )
    .limit(1);

  return row ?? null;
}

export async function requireOrganizationMember(
  db: Database,
  userId: string,
  organizationId: string
): Promise<OrganizationContext> {
  const [context] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId),
        eq(organizations.status, 'active')
      )
    )
    .limit(1);

  if (!context) throw new UnauthorizedError('Organization membership required.');
  return context;
}

export async function requireOrganizationManager(
  db: Database,
  userId: string,
  organizationId: string
): Promise<OrganizationContext> {
  const context = await requireOrganizationMember(db, userId, organizationId);
  if (!canManageOrganization(context.role)) throw new UnauthorizedError('Organization admin access required.');
  return context;
}

export async function requireOrganizationBillingManager(
  db: Database,
  userId: string,
  organizationId: string
): Promise<OrganizationContext> {
  const context = await requireOrganizationMember(db, userId, organizationId);
  if (!canManageOrganizationBilling(context.role)) {
    throw new UnauthorizedError('Organization billing access required.');
  }
  return context;
}
