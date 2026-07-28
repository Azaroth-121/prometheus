import type { ReactNode } from 'react';
import Link from 'next/link';
import { SignOutButton } from './sign-out-button';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/faqs', label: 'FAQs' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-brand-700 hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </div>
      {children}
    </div>
  );
}
