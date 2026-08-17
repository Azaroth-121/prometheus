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
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Card className="flex flex-col gap-1">
        <p className="text-gray-600">Signed in as</p>
        <p className="font-medium">{profile?.email ?? 'unknown'}</p>
      </Card>
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
    </div>
  );
}
