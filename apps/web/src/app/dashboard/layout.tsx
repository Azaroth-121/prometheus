import type { ReactNode } from 'react';
import Link from 'next/link';
import { getCurrentProfile, resolveActiveOrg } from '@prometheus/auth';
import type { OrgSummary } from '@prometheus/shared-types';
import { Glow } from '@prometheus/ui';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getUserOrgs } from '@/lib/org';
import { DashboardNav } from './dashboard-nav';
import { OrgSwitcher } from './org-switcher';
import { SignOutButton } from './sign-out-button';

async function loadOrgs(): Promise<{ orgs: OrgSummary[]; active: OrgSummary | null }> {
  if (!env.featureOrgs) return { orgs: [], active: null };

  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  if (!profile) return { orgs: [], active: null };

  const orgs = await getUserOrgs(profile);
  // No orgId claim exists until E0.4 -- pass it through here once the
  // session carries one, so the JWT's org is honored (if the user is a member).
  return { orgs, active: resolveActiveOrg(orgs) };
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { orgs, active } = await loadOrgs();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        {/* flex-wrap: with the org pill added, logo + pill + nav no longer fit on
            one row below ~760px -- nav drops to a second row instead of
            squeezing the org name to nothing. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Glow className="h-2 w-2" />
              <span className="font-display text-sm font-semibold tracking-widest text-ink uppercase">
                Prometheus
              </span>
            </Link>
            {active && <OrgSwitcher orgs={orgs} activeOrgId={active.id} />}
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
