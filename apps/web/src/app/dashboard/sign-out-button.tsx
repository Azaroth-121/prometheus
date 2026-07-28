'use client';

import { useRouter } from 'next/navigation';
import { signOut } from '@prometheus/auth';
import { Button } from '@prometheus/ui';
import { createClient } from '@/lib/supabase/browser';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await signOut(supabase);
    router.push('/login');
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
