import { getCurrentProfile } from '@prometheus/auth';
import { getCurrentPlanInfo } from '@prometheus/billing';
import { Button, Card, Input } from '@prometheus/ui';
import { createClient } from '@/lib/supabase/server';
import { updateDisplayNameAction } from './actions';

export default async function SettingsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  const plan = profile ? await getCurrentPlanInfo(supabase, profile.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card className="flex flex-col gap-1">
        <p className="text-gray-600">Email</p>
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
      <Card className="flex flex-col gap-3">
        <p className="text-gray-600">Display name</p>
        <form action={updateDisplayNameAction} className="flex gap-2">
          <Input name="displayName" defaultValue={profile?.display_name ?? ''} placeholder="Your name" />
          <Button type="submit">Save</Button>
        </form>
      </Card>
    </div>
  );
}
