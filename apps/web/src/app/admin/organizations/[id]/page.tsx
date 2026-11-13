import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  adminAuditLogs,
  organizationMembers,
  organizations,
  organizationSubscriptions,
  optimizationRequests,
  plans,
  profiles,
} from '@prometheus/database';
import { isOrganizationId, ORGANIZATION_STATUS_REASON_MAX } from '@prometheus/auth';
import { getLicenseSummary, getOrganizationPeriodUsage, getOrganizationPlanInfo } from '@prometheus/billing';
import { Button, Card, Input } from '@prometheus/ui';
import { needsBillingAttention, requirePlatformAdmin, stripeDashboardUrl } from '@/lib/admin';
import { setOrganizationStatusAction } from '../actions';

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString();
}

function percent(used: number, limit: number) {
  return limit > 0 ? Math.round((used / limit) * 100) : 0;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <div className="text-ink">{children}</div>
    </div>
  );
}

export default async function AdminOrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; error?: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { updated, error } = await searchParams;
  if (!isOrganizationId(id)) notFound();
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!organization) notFound();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [members, [subscription], planInfo, licenses, statusHistory] = await Promise.all([
    db
      .select({
        id: organizationMembers.id,
        email: profiles.email,
        displayName: profiles.displayName,
        role: organizationMembers.role,
        licensed: sql<boolean>`${organizationMembers.licenseAssignedAt} is not null`,
        joinedAt: organizationMembers.createdAt,
        requests: sql<number>`count(${optimizationRequests.id})::int`,
        tokens: sql<number>`coalesce(sum(coalesce(${optimizationRequests.inputTokens}, 0) + coalesce(${optimizationRequests.outputTokens}, 0)), 0)::int`,
      })
      .from(organizationMembers)
      .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
      .leftJoin(
        optimizationRequests,
        and(
          eq(optimizationRequests.userId, profiles.id),
          eq(optimizationRequests.organizationId, id),
          gte(optimizationRequests.createdAt, since)
        )
      )
      .where(eq(organizationMembers.organizationId, id))
      .groupBy(organizationMembers.id, profiles.id, profiles.email, profiles.displayName)
      .orderBy(organizationMembers.createdAt),
    // The latest subscription in any state, so a past-due or canceled one still shows.
    db
      .select({
        status: organizationSubscriptions.status,
        planName: plans.name,
        currentPeriodStart: organizationSubscriptions.currentPeriodStart,
        currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: organizationSubscriptions.cancelAtPeriodEnd,
        providerCustomerId: organizationSubscriptions.providerCustomerId,
        providerSubscriptionId: organizationSubscriptions.providerSubscriptionId,
      })
      .from(organizationSubscriptions)
      .innerJoin(plans, eq(plans.id, organizationSubscriptions.planId))
      .where(eq(organizationSubscriptions.organizationId, id))
      .orderBy(desc(organizationSubscriptions.currentPeriodEnd))
      .limit(1),
    getOrganizationPlanInfo(db, organization),
    getLicenseSummary(db, id),
    db
      .select({
        createdAt: adminAuditLogs.createdAt,
        afterState: adminAuditLogs.afterState,
        reason: adminAuditLogs.reason,
        actorEmail: profiles.email,
      })
      .from(adminAuditLogs)
      .innerJoin(profiles, eq(profiles.id, adminAuditLogs.adminUserId))
      .where(and(eq(adminAuditLogs.organizationId, id), eq(adminAuditLogs.action, 'set_organization_status')))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(10),
  ]);
  const usage = await getOrganizationPeriodUsage(db, { ...planInfo, organizationId: id });

  const suspended = organization.status === 'suspended';
  const paymentProblem = needsBillingAttention(subscription?.status);
  const limitsFromFree = subscription && subscription.status !== 'active';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/organizations" className="text-sm text-glow-cyan hover:underline">All organizations</Link>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-glow-cyan">Organization</p>
        <h2 className="font-display text-xl font-semibold text-ink">
          {organization.name}
          {suspended && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 align-middle text-xs text-red-400">Suspended</span>}
        </h2>
        <p className="text-sm text-ink-muted">{organization.slug} - created {formatDate(organization.createdAt)}</p>
      </div>

      {updated === 'suspended' && <Card role="status" className="text-sm text-amber-400">Organization suspended. Its members can no longer select it or use its plan.</Card>}
      {updated === 'active' && <Card role="status" className="text-sm text-glow-cyan">Organization reactivated.</Card>}
      {error && <Card role="alert" className="text-sm text-red-400">{error}</Card>}

      <Card className="flex flex-col gap-4">
        <h3 className="font-display text-lg font-semibold text-ink">Billing</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Detail label="Plan">
            {subscription ? subscription.planName : 'Free'}
            {subscription && <p className={`text-sm ${paymentProblem ? 'text-amber-400' : 'text-ink-muted'}`}>Stripe: {subscription.status.replace('_', ' ')}</p>}
          </Detail>
          <Detail label="Billing period">
            {subscription ? `${formatDate(subscription.currentPeriodStart)} - ${formatDate(subscription.currentPeriodEnd)}` : 'Rolling 30 days (Free)'}
            {subscription?.cancelAtPeriodEnd && <p className="text-sm text-amber-400">Cancels at period end</p>}
          </Detail>
          <Detail label="Licenses">
            {licenses.purchased > 0
              ? `${licenses.assigned} of ${licenses.purchased} assigned`
              : subscription
                ? "None while the subscription isn't active"
                : 'None (no paid plan)'}
            {licenses.overBy > 0 && <p className="text-sm text-amber-400">{licenses.overBy} over the purchased count</p>}
          </Detail>
          <Detail label="Requests this period">
            {usage.requests.toLocaleString()} / {planInfo.monthlyRequestLimit.toLocaleString()}{' '}
            <span className="text-sm text-ink-muted">({percent(usage.requests, planInfo.monthlyRequestLimit)}%)</span>
          </Detail>
          <Detail label="Tokens this period">
            {usage.tokens.toLocaleString()} / {planInfo.monthlyTokenLimit.toLocaleString()}{' '}
            <span className="text-sm text-ink-muted">({percent(usage.tokens, planInfo.monthlyTokenLimit)}%)</span>
          </Detail>
          {subscription && (
            <Detail label="Stripe">
              <a href={stripeDashboardUrl(`customers/${subscription.providerCustomerId}`)} target="_blank" rel="noreferrer" className="text-glow-cyan hover:underline">Customer</a>
              {' - '}
              <a href={stripeDashboardUrl(`subscriptions/${subscription.providerSubscriptionId}`)} target="_blank" rel="noreferrer" className="text-glow-cyan hover:underline">Subscription</a>
            </Detail>
          )}
        </div>
        {limitsFromFree && (
          <p className="text-sm text-amber-400">
            The subscription isn&apos;t active, so the organization is held to Free limits until it&apos;s paid or renewed.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{suspended ? 'Reactivate organization' : 'Suspend organization'}</h3>
          <p className="text-sm text-ink-muted">
            {suspended
              ? 'Members can select the organization and use its plan again.'
              : "Members can no longer select the organization, manage it or use its plan. Stripe billing keeps running: cancel or refund in Stripe if that's needed."}
          </p>
        </div>
        <form action={setOrganizationStatusAction} className="flex flex-col gap-2">
          <input type="hidden" name="organizationId" value={organization.id} />
          <input type="hidden" name="nextStatus" value={suspended ? 'active' : 'suspended'} />
          <Input name="reason" required maxLength={ORGANIZATION_STATUS_REASON_MAX} placeholder="Reason (required, kept in the audit log)" aria-label="Reason" />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" name="confirm" required />
            {suspended ? `Reactivate ${organization.name}` : `Suspend ${organization.name} and its ${members.length} ${members.length === 1 ? 'member' : 'members'}`}
          </label>
          <Button type="submit" variant={suspended ? 'primary' : 'secondary'} className="self-start">
            {suspended ? 'Reactivate' : 'Suspend'}
          </Button>
        </form>
        {statusHistory.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-sm text-ink-muted">History</p>
            {statusHistory.map((event) => (
              <p key={`${event.createdAt.toISOString()}-${event.actorEmail}`} className="py-1 text-sm text-ink">
                {(event.afterState as { status?: string } | null)?.status === 'suspended' ? 'Suspended' : 'Reactivated'} {formatDate(event.createdAt)} by {event.actorEmail}
                {event.reason && <span className="text-ink-muted"> - {event.reason}</span>}
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card className="divide-y divide-line p-0">
        {members.map((member) => (
          <div key={member.id} className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium text-ink">{member.displayName || member.email}</p>
              <p className="break-all text-sm text-ink-muted">
                {member.email} - {member.role}
                {member.licensed && <span className="ml-2 rounded bg-glow-cyan/10 px-1.5 py-0.5 text-xs text-glow-cyan">Licensed</span>}
              </p>
            </div>
            <p className="text-sm text-ink-muted sm:text-right">{member.requests} requests<br className="hidden sm:inline" /> {member.tokens.toLocaleString()} tokens / 30d</p>
          </div>
        ))}
      </Card>
    </div>
  );
}
