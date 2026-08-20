import { auth } from '@/lib/auth';
import { getCurrentProfile } from '@prometheus/auth';
import { getCurrentPlanInfo } from '@prometheus/billing';
import { Card } from '@prometheus/ui';
import { db } from '@/lib/db';
import { UsageCard } from './usage-card';

export default async function DashboardPage() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  const plan = profile ? await getCurrentPlanInfo(db, profile.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
      <Card className="flex flex-col gap-1">
        <p className="text-ink-muted">Signed in as</p>
        <p className="font-medium text-ink">{profile?.email ?? 'unknown'}</p>
      </Card>
      <Card className="flex flex-col gap-1">
        <p className="text-ink-muted">Current plan</p>
        <p className="font-medium text-ink">{plan?.planName ?? 'Free'}</p>
        {plan?.expiresAt && (
          <p className="text-sm text-ink-muted">
            Access until {new Date(plan.expiresAt).toLocaleDateString()}
          </p>
        )}
      </Card>
      {profile && <UsageCard userId={profile.id} />}
    </div>
  );
}
