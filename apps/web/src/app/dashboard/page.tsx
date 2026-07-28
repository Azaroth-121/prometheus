import { getCurrentProfile } from '@prometheus/auth';
import { Card } from '@prometheus/ui';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from './sign-out-button';

export default async function DashboardPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <SignOutButton />
      </div>
      <Card>
        <p className="text-gray-600">Signed in as</p>
        <p className="font-medium">{profile?.email ?? 'unknown'}</p>
      </Card>
    </main>
  );
}
