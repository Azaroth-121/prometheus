'use server';

import { createHash, randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  getCurrentProfile,
  requireOrganizationManager,
  requireOrganizationMember,
} from '@prometheus/auth';
import {
  adminAuditLogs,
  organizationInvitations,
  organizationMembers,
  organizations,
  profiles,
} from '@prometheus/database';
import type { OrganizationRole } from '@prometheus/shared-types';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

const INVITABLE_ROLES = ['admin', 'member', 'billing'] as const;
const INVITATION_TTL_DAYS = 7;

export interface InviteMemberState {
  error: string | null;
  message: string | null;
  inviteUrl: string | null;
}

async function requireActor() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  if (!profile || profile.status !== 'active') throw new Error('Not authenticated.');
  return profile;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'organization'}-${randomBytes(3).toString('hex')}`;
}

async function requestIp(): Promise<string | null> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

export async function createOrganizationAction(formData: FormData) {
  const actor = await requireActor();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 100) throw new Error('Organization name must be 2-100 characters.');
  const ipAddress = await requestIp();

  await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name, slug: slugify(name), createdBy: actor.id })
      .returning({ id: organizations.id });
    if (!organization) throw new Error('Could not create the organization.');

    await tx.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: actor.id,
      role: 'owner',
    });
    await tx
      .update(profiles)
      .set({ activeOrganizationId: organization.id, updatedAt: new Date() })
      .where(eq(profiles.id, actor.id));
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId: organization.id,
      action: 'create_organization',
      targetType: 'organization',
      targetId: organization.id,
      afterState: { name },
      ipAddress,
    });
  });

  redirect('/dashboard/organization');
}

export async function switchOrganizationAction(formData: FormData) {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');

  if (organizationId) await requireOrganizationMember(db, actor.id, organizationId);

  await db
    .update(profiles)
    .set({ activeOrganizationId: organizationId || null, updatedAt: new Date() })
    .where(eq(profiles.id, actor.id));

  revalidatePath('/dashboard', 'layout');
  redirect(organizationId ? '/dashboard/organization' : '/dashboard');
}

export async function updateOrganizationNameAction(formData: FormData) {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 100) throw new Error('Organization name must be 2-100 characters.');
  await requireOrganizationManager(db, actor.id, organizationId);
  const [before] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(organizations).set({ name, updatedAt: new Date() }).where(eq(organizations.id, organizationId));
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId,
      action: 'update_organization',
      targetType: 'organization',
      targetId: organizationId,
      beforeState: { name: before?.name },
      afterState: { name },
      ipAddress: await requestIp(),
    });
  });
  revalidatePath('/dashboard/organization');
}

export async function inviteMemberAction(
  _previous: InviteMemberState,
  formData: FormData
): Promise<InviteMemberState> {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? 'member') as (typeof INVITABLE_ROLES)[number];
  if (!email.includes('@')) return { error: 'Enter a valid email address.', message: null, inviteUrl: null };
  if (!INVITABLE_ROLES.includes(role)) return { error: 'Choose a valid role.', message: null, inviteUrl: null };

  const context = await requireOrganizationManager(db, actor.id, organizationId);
  if (context.role !== 'owner' && role !== 'member') {
    return { error: 'Only the owner can invite administrators or billing managers.', message: null, inviteUrl: null };
  }

  const [existingMember] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, organizationId), sql`lower(${profiles.email}) = ${email}`))
    .limit(1);
  if (existingMember) return { error: 'That person is already a member.', message: null, inviteUrl: null };

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const ipAddress = await requestIp();

  await db.transaction(async (tx) => {
    await tx
      .update(organizationInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(organizationInvitations.organizationId, organizationId),
          sql`lower(${organizationInvitations.email}) = ${email}`,
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt)
        )
      );
    const [invitation] = await tx
      .insert(organizationInvitations)
      .values({ organizationId, email, role, tokenHash, invitedBy: actor.id, expiresAt })
      .returning({ id: organizationInvitations.id });
    if (!invitation) throw new Error('Could not create the invitation.');
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId,
      action: 'invite_organization_member',
      targetType: 'organization_invitation',
      targetId: invitation.id,
      afterState: { email, role, expiresAt: expiresAt.toISOString() },
      ipAddress,
    });
  });

  const inviteUrl = `${env.appUrl}/invitations/${token}`;
  const webhookUrl = process.env.MAKE_ORGANIZATION_INVITE_WEBHOOK_URL;
  let delivered = false;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, organization_name: context.name, role, invite_url: inviteUrl }),
      });
      delivered = response.ok;
    } catch {
      delivered = false;
    }
  }

  revalidatePath('/dashboard/organization');
  return {
    error: null,
    message: delivered
      ? `Invitation sent to ${email}.`
      : 'Invitation created. Copy the secure link below to share it.',
    inviteUrl,
  };
}

export async function acceptInvitationAction(formData: FormData) {
  const actor = await requireActor();
  const token = String(formData.get('token') ?? '');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [invitation] = await db
    .select()
    .from(organizationInvitations)
    .where(eq(organizationInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    throw new Error('This invitation is invalid or has expired.');
  }
  if (invitation.email.toLowerCase() !== actor.email.toLowerCase()) {
    throw new Error(`This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`);
  }

  const ipAddress = await requestIp();
  await db.transaction(async (tx) => {
    await tx
      .insert(organizationMembers)
      .values({ organizationId: invitation.organizationId, userId: actor.id, role: invitation.role })
      .onConflictDoNothing({ target: [organizationMembers.organizationId, organizationMembers.userId] });
    await tx
      .update(organizationInvitations)
      .set({ acceptedBy: actor.id, acceptedAt: new Date() })
      .where(and(eq(organizationInvitations.id, invitation.id), isNull(organizationInvitations.acceptedAt)));
    await tx
      .update(profiles)
      .set({ activeOrganizationId: invitation.organizationId, updatedAt: new Date() })
      .where(eq(profiles.id, actor.id));
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId: invitation.organizationId,
      action: 'accept_organization_invitation',
      targetType: 'organization_member',
      targetId: actor.id,
      afterState: { role: invitation.role },
      ipAddress,
    });
  });

  redirect('/dashboard/organization');
}

export async function updateMemberRoleAction(formData: FormData) {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');
  const memberId = String(formData.get('memberId') ?? '');
  const role = String(formData.get('role') ?? '') as OrganizationRole;
  if (!INVITABLE_ROLES.includes(role as (typeof INVITABLE_ROLES)[number])) throw new Error('Invalid role.');

  const context = await requireOrganizationManager(db, actor.id, organizationId);
  const [target] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  if (!target || target.role === 'owner') throw new Error('The organization owner cannot be reassigned here.');
  if (context.role !== 'owner' && (target.role !== 'member' || role !== 'member')) {
    throw new Error('Only the owner can assign privileged roles.');
  }

  await db.transaction(async (tx) => {
    await tx.update(organizationMembers).set({ role, updatedAt: new Date() }).where(eq(organizationMembers.id, memberId));
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId,
      action: 'update_organization_member_role',
      targetType: 'organization_member',
      targetId: memberId,
      beforeState: { role: target.role },
      afterState: { role },
      ipAddress: await requestIp(),
    });
  });
  revalidatePath('/dashboard/organization');
}

export async function removeMemberAction(formData: FormData) {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');
  const memberId = String(formData.get('memberId') ?? '');
  const context = await requireOrganizationManager(db, actor.id, organizationId);
  const [target] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  if (!target || target.role === 'owner') throw new Error('The organization owner cannot be removed.');
  if (context.role !== 'owner' && target.role !== 'member') throw new Error('Only the owner can remove privileged members.');

  await db.transaction(async (tx) => {
    await tx.delete(organizationMembers).where(eq(organizationMembers.id, memberId));
    await tx
      .update(profiles)
      .set({ activeOrganizationId: null, updatedAt: new Date() })
      .where(and(eq(profiles.id, target.userId), eq(profiles.activeOrganizationId, organizationId)));
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId,
      action: 'remove_organization_member',
      targetType: 'organization_member',
      targetId: memberId,
      beforeState: { userId: target.userId, role: target.role },
      ipAddress: await requestIp(),
    });
  });
  revalidatePath('/dashboard/organization');
}

export async function transferOwnershipAction(formData: FormData) {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');
  const memberId = String(formData.get('memberId') ?? '');
  const context = await requireOrganizationManager(db, actor.id, organizationId);
  if (context.role !== 'owner') throw new Error('Only the current owner can transfer ownership.');
  const [target] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  if (!target || target.userId === actor.id) throw new Error('Choose another member.');

  await db.transaction(async (tx) => {
    await tx
      .update(organizationMembers)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, actor.id)));
    await tx.update(organizationMembers).set({ role: 'owner', updatedAt: new Date() }).where(eq(organizationMembers.id, memberId));
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId,
      action: 'transfer_organization_ownership',
      targetType: 'organization_member',
      targetId: memberId,
      beforeState: { ownerUserId: actor.id, targetRole: target.role },
      afterState: { ownerUserId: target.userId },
      ipAddress: await requestIp(),
    });
  });
  revalidatePath('/dashboard/organization');
}

export async function leaveOrganizationAction(formData: FormData) {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');
  const context = await requireOrganizationMember(db, actor.id, organizationId);
  if (context.role === 'owner') throw new Error('Transfer ownership before leaving the organization.');

  await db.transaction(async (tx) => {
    await tx.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId,
      action: 'leave_organization',
      targetType: 'organization_member',
      targetId: actor.id,
      beforeState: { role: context.role },
      ipAddress: await requestIp(),
    });
    await tx
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, actor.id)));
    await tx.update(profiles).set({ activeOrganizationId: null, updatedAt: new Date() }).where(eq(profiles.id, actor.id));
  });
  redirect('/dashboard');
}

export async function revokeInvitationAction(formData: FormData) {
  const actor = await requireActor();
  const organizationId = String(formData.get('organizationId') ?? '');
  const invitationId = String(formData.get('invitationId') ?? '');
  await requireOrganizationManager(db, actor.id, organizationId);
  const [invitation] = await db
    .update(organizationInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(organizationInvitations.id, invitationId),
        eq(organizationInvitations.organizationId, organizationId),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt)
      )
    )
    .returning({ email: organizationInvitations.email });
  if (invitation) {
    await db.insert(adminAuditLogs).values({
      adminUserId: actor.id,
      organizationId,
      action: 'revoke_organization_invitation',
      targetType: 'organization_invitation',
      targetId: invitationId,
      beforeState: { email: invitation.email },
      ipAddress: await requestIp(),
    });
  }
  revalidatePath('/dashboard/organization');
}
