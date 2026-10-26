import type { ReactNode } from 'react';
import Link from 'next/link';
import { getActiveOrganization } from '@prometheus/auth';
import { Glow } from '@prometheus/ui';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { DashboardNav } from './dashboard-nav';
import { OrgSwitcher } from './org-switcher';
import { SignOutButton } from './sign-out-button';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  // getActiveOrganization re-checks membership on every request. null means
  // the user is acting in their personal context, not that they're signed out.
  const activeOrganization = session?.user?.id ? await getActiveOrganization(db, session.user.id) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        {/* flex-wrap: on narrow screens the nav drops to a second row instead of
            squeezing the org pill's name to nothing. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Glow className="h-2 w-2" />
              <span className="font-display text-sm font-semibold tracking-widest text-ink uppercase">
                Prometheus
              </span>
            </Link>
            {session?.user?.id && <OrgSwitcher organization={activeOrganization} />}
          </div>
          <div className="flex items-center gap-4">
            <DashboardNav />
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        {children}
      </div>
    </div>
  );
}
