import { auth } from '@/lib/auth';
import { getCurrentProfile } from '@prometheus/auth';
import { getCurrentPlanInfo } from '@prometheus/billing';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';
import { UsageCard } from '../usage-card';
import { PlanCards } from './plan-cards';

export default async function BillingPage() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  const plan = profile ? await getCurrentPlanInfo(db, profile.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Upgrade Prometheus</h1>
        <p className="text-gray-600">
          Each payment is one-time and grants 30 days of access — not an auto-renewing
          subscription. Pay again anytime to extend.
        </p>
      </div>
      <Card className="flex flex-col gap-1">
        <p className="text-gray-600">Current plan</p>
        <p className="font-medium">{plan?.planName ?? 'Free'}</p>
        {plan?.expiresAt && (
          <p className="text-sm text-gray-500">
            Access until {new Date(plan.expiresAt).toLocaleDateString()}
          </p>
        )}
      </Card>
      {profile && <UsageCard userId={profile.id} />}
      <p className="text-center text-2xl font-bold text-brand-700">
        Donate to Kurt for being a goodboy 🐶
      </p>
      <PlanCards />
    </div>
  );
}
