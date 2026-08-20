import { auth } from '@/lib/auth';
import { getCurrentProfile } from '@prometheus/auth';
import { getCurrentPlanInfo } from '@prometheus/billing';
import { Button, Card, Input } from '@prometheus/ui';
import { db } from '@/lib/db';
import { updateDisplayNameAction } from './actions';

export default async function SettingsPage() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  const plan = profile ? await getCurrentPlanInfo(db, profile.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Settings</h1>
      <Card className="flex flex-col gap-1">
        <p className="text-ink-muted">Email</p>
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
      <Card className="flex flex-col gap-3">
        <p className="text-ink-muted">Display name</p>
        <form action={updateDisplayNameAction} className="flex gap-2">
          <Input name="displayName" defaultValue={profile?.display_name ?? ''} placeholder="Your name" />
          <Button type="submit">Save</Button>
        </form>
      </Card>
    </div>
  );
}
