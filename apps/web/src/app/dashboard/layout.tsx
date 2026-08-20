import type { ReactNode } from 'react';
import Link from 'next/link';
import { Glow } from '@prometheus/ui';
import { DashboardNav } from './dashboard-nav';
import { SignOutButton } from './sign-out-button';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Glow className="h-2 w-2" />
            <span className="font-display text-sm font-semibold tracking-widest text-ink uppercase">
              Prometheus
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <DashboardNav />
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        {children}
      </div>
    </div>
  );
}
