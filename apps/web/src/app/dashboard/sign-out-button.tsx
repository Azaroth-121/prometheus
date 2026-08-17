'use client';

import { signOut } from 'next-auth/react';
import { Button } from '@prometheus/ui';

export function SignOutButton() {
  return (
    <Button variant="secondary" onClick={() => signOut({ callbackUrl: '/login' })}>
      Sign out
    </Button>
  );
}
