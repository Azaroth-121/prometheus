import Link from 'next/link';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveOrganization, getCurrentProfile, getUserOrganizations } from '@prometheus/auth';
import { getCurrentPlanInfo, getLicenseSummary, getOrganizationMemberUsage, getUsageSummary } from '@prometheus/billing';
import {
  adminAuditLogs,
  organizationInvitations,
  organizationMembers,
  profiles,
} from '@prometheus/database';
import { Button, Card, Input } from '@prometheus/ui';
import {
  assignLicenseAction,
  createOrganizationAction,
  leaveOrganizationAction,
  reassignLicenseAction,
  removeLicenseAction,
  removeMemberAction,
  revokeInvitationAction,
  switchOrganizationAction,
  transferOwnershipAction,
  updateOrganizationNameAction,
  updateMemberRoleAction,
} from './actions';
import { InviteMemberForm } from './invite-member-form';

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default async function OrganizationPage() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  if (!profile) return null;

  const [organizationList, activeOrganization] = await Promise.all([
    getUserOrganizations(db, profile.id),
    getActiveOrganization(db, profile.id),
  ]);

  if (!activeOrganization) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Organization</h1>
          <p className="text-ink-muted">Create a shared workspace or switch into one you already belong to.</p>
        </div>
        {organizationList.length > 0 && (
          <Card className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">Your organizations</h2>
            {organizationList.map((organization) => (
              <form key={organization.id} action={switchOrganizationAction} className="flex items-center justify-between gap-4 rounded border border-line p-3">
                <input type="hidden" name="organizationId" value={organization.id} />
                <div>
                  <p className="font-medium text-ink">{organization.name}</p>
                  <p className="text-sm text-ink-muted">{roleLabel(organization.role)}</p>
                </div>
                <Button type="submit" variant="secondary">Open</Button>
              </form>
            ))}
          </Card>
        )}
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Create an organization</h2>
            <p className="text-sm text-ink-muted">You become the owner and can invite members immediately.</p>
          </div>
          <form action={createOrganizationAction} className="flex gap-2">
            <Input name="name" required minLength={2} maxLength={100} placeholder="Acme Labs" />
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    );
  }

  const canManage = activeOrganization.role === 'owner' || activeOrganization.role === 'admin';
  const isOwner = activeOrganization.role === 'owner';
  const [members, invitations, auditEvents, plan, usage, licenses] = await Promise.all([
    db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        email: profiles.email,
        displayName: profiles.displayName,
        joinedAt: organizationMembers.createdAt,
        licenseAssignedAt: organizationMembers.licenseAssignedAt,
      })
      .from(organizationMembers)
      .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, activeOrganization.id))
      .orderBy(organizationMembers.createdAt),
    canManage
      ? db
          .select()
          .from(organizationInvitations)
          .where(
            and(
              eq(organizationInvitations.organizationId, activeOrganization.id),
              isNull(organizationInvitations.acceptedAt),
              isNull(organizationInvitations.revokedAt),
              gt(organizationInvitations.expiresAt, new Date())
            )
          )
          .orderBy(desc(organizationInvitations.createdAt))
      : Promise.resolve([]),
    db
      .select({
        id: adminAuditLogs.id,
        action: adminAuditLogs.action,
        targetType: adminAuditLogs.targetType,
        actorEmail: profiles.email,
        createdAt: adminAuditLogs.createdAt,
      })
      .from(adminAuditLogs)
      .innerJoin(profiles, eq(profiles.id, adminAuditLogs.adminUserId))
      .where(eq(adminAuditLogs.organizationId, activeOrganization.id))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(20),
    getCurrentPlanInfo(db, profile.id),
    getUsageSummary(db, profile.id),
    getLicenseSummary(db, activeOrganization.id),
  ]);
  const memberUsage = await getOrganizationMemberUsage(db, activeOrganization.id, plan.periodStart);
  const usageByUser = new Map(memberUsage.map((row) => [row.userId, row]));
  const unlicensedMembers = members.filter((member) => !member.licenseAssignedAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-glow-cyan">Organization</p>
          <h1 className="font-display text-2xl font-semibold text-ink">{activeOrganization.name}</h1>
          <p className="text-ink-muted">You are an {activeOrganization.role}.</p>
        </div>
        <form action={switchOrganizationAction} className="flex gap-2">
          <select name="organizationId" defaultValue={activeOrganization.id} className="rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="">Individual account</option>
            {organizationList.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
          <Button type="submit" variant="secondary">Switch</Button>
        </form>
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {canManage ? (
          <form action={updateOrganizationNameAction} className="flex flex-1 gap-2">
            <input type="hidden" name="organizationId" value={activeOrganization.id} />
            <Input name="name" defaultValue={activeOrganization.name} minLength={2} maxLength={100} required />
            <Button type="submit" variant="secondary">Rename</Button>
          </form>
        ) : <p className="text-sm text-ink-muted">Organization settings are managed by an owner or admin.</p>}
        {activeOrganization.role !== 'owner' && (
          <form action={leaveOrganizationAction}>
            <input type="hidden" name="organizationId" value={activeOrganization.id} />
            <Button type="submit" variant="ghost" className="text-red-400">Leave organization</Button>
          </form>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-sm text-ink-muted">Members</p><p className="text-2xl font-semibold text-ink">{members.length}</p></Card>
        <Card>
          <p className="text-sm text-ink-muted">Licenses assigned</p>
          <p className="text-2xl font-semibold text-ink">{licenses.assigned} / {licenses.purchased}</p>
          <p className="text-xs text-ink-muted">
            {licenses.purchased === 0 ? (
              <>Subscribe on <Link href="/dashboard/billing" className="text-glow-cyan hover:underline">Billing</Link> to get licenses.</>
            ) : licenses.available === 0 ? (
              <>None available. Buy more on <Link href="/dashboard/billing" className="text-glow-cyan hover:underline">Billing</Link>.</>
            ) : (
              `${licenses.available} available`
            )}
          </p>
        </Card>
        <Card><p className="text-sm text-ink-muted">Plan</p><p className="text-2xl font-semibold text-ink">{plan.planName}</p></Card>
        <Card><p className="text-sm text-ink-muted">Shared requests</p><p className="text-2xl font-semibold text-ink">{usage.requests_used.toLocaleString()} / {usage.requests_limit.toLocaleString()}</p></Card>
      </div>

      {licenses.overBy > 0 && (
        <Card className="text-sm text-amber-400">
          {licenses.overBy} more {licenses.overBy === 1 ? 'member holds a license' : 'members hold licenses'} than the organization has purchased. Remove licenses below or buy more on the Billing page.
        </Card>
      )}

      {canManage && (
        <Card className="flex flex-col gap-4">
          <div><h2 className="font-display text-lg font-semibold text-ink">Invite a member</h2><p className="text-sm text-ink-muted">Invitations expire after seven days.</p></div>
          <InviteMemberForm organizationId={activeOrganization.id} isOwner={isOwner} />
          {invitations.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-sm text-ink-muted">Pending invitations</p>
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between gap-3 py-1 text-sm">
                  <p className="text-ink">{invitation.email} <span className="text-ink-muted">- {invitation.role}</span></p>
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="organizationId" value={activeOrganization.id} />
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <Button type="submit" variant="ghost">Revoke</Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line p-4"><h2 className="font-display text-lg font-semibold text-ink">Members and usage</h2></div>
        <div className="divide-y divide-line">
          {members.map((member) => {
            const memberUsageRow = usageByUser.get(member.userId);
            const editable = canManage && member.role !== 'owner' && member.userId !== profile.id;
            return (
              <div key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 font-medium text-ink">
                    {member.displayName || member.email}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${member.licenseAssignedAt ? 'bg-glow/20 text-ink' : 'bg-white/10 text-ink-muted'}`}>
                      {member.licenseAssignedAt ? 'Licensed' : 'No license'}
                    </span>
                  </p>
                  <p className="text-sm text-ink-muted">{member.email} - {roleLabel(member.role)} - {memberUsageRow?.requests ?? 0} requests / {(memberUsageRow?.tokens ?? 0).toLocaleString()} tokens</p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-xs uppercase tracking-wide text-ink-muted">License</span>
                    {member.licenseAssignedAt ? (
                      <>
                        <form action={removeLicenseAction}>
                          <input type="hidden" name="organizationId" value={activeOrganization.id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <Button type="submit" variant="ghost">Remove</Button>
                        </form>
                        {unlicensedMembers.length > 0 && (
                          <form action={reassignLicenseAction} className="flex gap-2">
                            <input type="hidden" name="organizationId" value={activeOrganization.id} />
                            <input type="hidden" name="memberId" value={member.id} />
                            <select name="toMemberId" defaultValue="" required aria-label="Move license to" className="rounded border border-line bg-surface px-2 text-sm text-ink">
                              <option value="" disabled>Move to...</option>
                              {unlicensedMembers.map((other) => <option key={other.id} value={other.id}>{other.displayName || other.email}</option>)}
                            </select>
                            <Button type="submit" variant="ghost">Move</Button>
                          </form>
                        )}
                      </>
                    ) : (
                      <form action={assignLicenseAction}>
                        <input type="hidden" name="organizationId" value={activeOrganization.id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <Button type="submit" variant="secondary" disabled={licenses.available < 1}>
                          Assign
                        </Button>
                      </form>
                    )}
                  </div>
                )}
                {editable && (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-xs uppercase tracking-wide text-ink-muted">Member</span>
                    <form action={updateMemberRoleAction} className="flex gap-2">
                      <input type="hidden" name="organizationId" value={activeOrganization.id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <select name="role" defaultValue={member.role} className="rounded border border-line bg-surface px-2 text-sm text-ink">
                        <option value="member">Member</option>
                        {isOwner && <option value="admin">Admin</option>}
                        {isOwner && <option value="billing">Billing</option>}
                      </select>
                      <Button type="submit" variant="secondary">Save</Button>
                    </form>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="organizationId" value={activeOrganization.id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <Button type="submit" variant="ghost" className="text-red-400">Remove</Button>
                    </form>
                    {isOwner && (
                      <form action={transferOwnershipAction}>
                        <input type="hidden" name="organizationId" value={activeOrganization.id} />
                        <input type="hidden" name="memberId" value={member.id} />
                        <Button type="submit" variant="ghost">Make owner</Button>
                      </form>
                    )}
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Audit log</h2>
        {auditEvents.map((event) => (
          <div key={event.id} className="flex justify-between gap-4 border-t border-line pt-3 text-sm">
            <div><p className="text-ink">{event.action.replaceAll('_', ' ')}</p><p className="text-ink-muted">{event.actorEmail} - {event.targetType}</p></div>
            <time className="shrink-0 text-ink-muted">{event.createdAt.toLocaleString()}</time>
          </div>
        ))}
        {auditEvents.length === 0 && <p className="text-sm text-ink-muted">No organization events yet.</p>}
      </Card>
    </div>
  );
}
