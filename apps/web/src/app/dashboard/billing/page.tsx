import { Suspense } from 'react';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getActiveOrganization, getCurrentProfile } from '@prometheus/auth';
import {
  getCurrentPlanInfo,
  getLicenseSummary,
  ORGANIZATION_LICENSE_MAX,
  ORGANIZATION_LICENSE_MIN,
} from '@prometheus/billing';
import { organizationSubscriptions, subscriptions } from '@prometheus/database';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';
import { UsageCard } from '../usage-card';
import { BillingHistory, BillingHistoryLoading } from './billing-history';
import { LicenseCountForm } from './license-count-form';
import { ManageBillingButton } from './manage-billing-button';
import { PlanCards } from './plan-cards';

export default async function BillingPage() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  const plan = profile ? await getCurrentPlanInfo(db, profile.id) : null;
  const activeOrganization = profile ? await getActiveOrganization(db, profile.id) : null;
  const licenses = activeOrganization ? await getLicenseSummary(db, activeOrganization.id) : null;
  const canManageBilling = !activeOrganization || activeOrganization.role === 'owner' || activeOrganization.role === 'billing';
  const isPaidPlan = plan?.planCode !== 'free';
  // An organization that already pays changes its license count or plan
  // instead of starting a second subscription.
  const hasOrganizationSubscription = Boolean(licenses?.providerSubscriptionId);
  // Same customer lookup as the billing portal route: the latest subscription
  // in this billing scope, active or not, so past invoices stay visible.
  const [billingCustomer] =
    profile && canManageBilling
      ? activeOrganization
        ? await db
            .select({ id: organizationSubscriptions.providerCustomerId })
            .from(organizationSubscriptions)
            .where(eq(organizationSubscriptions.organizationId, activeOrganization.id))
            .orderBy(desc(organizationSubscriptions.createdAt))
            .limit(1)
        : await db
            .select({ id: subscriptions.providerCustomerId })
            .from(subscriptions)
            .where(eq(subscriptions.userId, profile.id))
            .orderBy(desc(subscriptions.createdAt))
            .limit(1)
      : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">
          {activeOrganization ? `${activeOrganization.name} billing` : 'Upgrade Prometheus'}
        </h1>
        <p className="text-ink-muted">
          Paid plans auto-renew monthly. Cancel or change plans anytime from Manage billing.
        </p>
      </div>
      <Card className="flex flex-col gap-2">
        <p className="text-ink-muted">Current plan</p>
        <p className="font-medium text-ink">{plan?.planName ?? 'Free'}</p>
        {plan?.expiresAt && (
          <p className="text-sm text-ink-muted">
            Renews {new Date(plan.expiresAt).toLocaleDateString()}
          </p>
        )}
        {isPaidPlan && canManageBilling && <ManageBillingButton />}
        {!canManageBilling && <p className="text-sm text-ink-muted">Only the organization owner or billing manager can change this plan.</p>}
      </Card>
      {licenses && hasOrganizationSubscription && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Licenses</h2>
          <p className="text-ink">
            {licenses.purchased} purchased · {licenses.assigned} assigned · {licenses.available} available
          </p>
          {licenses.overBy > 0 && (
            <p className="text-sm text-amber-400">
              {licenses.overBy} more {licenses.overBy === 1 ? 'member holds a license' : 'members hold licenses'} than you have purchased. Buy more licenses or remove some from the Organization page.
            </p>
          )}
          {canManageBilling && (
            <LicenseCountForm purchased={licenses.purchased} assigned={licenses.assigned} maximum={ORGANIZATION_LICENSE_MAX} />
          )}
        </Card>
      )}
      {profile && <UsageCard userId={profile.id} />}
      {billingCustomer && (
        <Suspense fallback={<BillingHistoryLoading />}>
          <BillingHistory customerId={billingCustomer.id} />
        </Suspense>
      )}
      {!hasOrganizationSubscription && (
        <PlanCards
          disabled={!canManageBilling}
          licenses={activeOrganization ? { min: ORGANIZATION_LICENSE_MIN, max: ORGANIZATION_LICENSE_MAX } : undefined}
        />
      )}
    </div>
  );
}
