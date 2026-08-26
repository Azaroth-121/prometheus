import { auth } from '@/lib/auth';
import { getCurrentProfile } from '@prometheus/auth';
import { getCurrentPlanInfo } from '@prometheus/billing';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';
import { UsageCard } from '../usage-card';
import { ManageBillingButton } from './manage-billing-button';
import { PlanCards } from './plan-cards';

export default async function BillingPage() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  const plan = profile ? await getCurrentPlanInfo(db, profile.id) : null;
  const isPaidPlan = plan?.planCode !== 'free';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Upgrade Prometheus</h1>
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
        {isPaidPlan && <ManageBillingButton />}
      </Card>
      {profile && <UsageCard userId={profile.id} />}
      <PlanCards />
    </div>
  );
}
