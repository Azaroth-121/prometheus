import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@prometheus/auth';
import { isAdminRole } from '@prometheus/shared-types';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const NAV_LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/requests', label: 'Requests' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;

  if (!profile || profile.status !== 'active' || !isAdminRole(profile.role)) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <h1 className="font-display text-2xl font-semibold text-ink">Admin</h1>
        <nav className="flex gap-4 text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-ink-muted hover:text-glow-cyan">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
