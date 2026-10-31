'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/organization', label: 'Organization' },
  { href: '/dashboard/faqs', label: 'FAQs' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="-ml-3 flex min-w-0 flex-wrap gap-1 text-sm lg:ml-0">
      {NAV_LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded px-3 py-1.5 transition-colors ${
              active ? 'bg-surface-raised text-glow-cyan' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
