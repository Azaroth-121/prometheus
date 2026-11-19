import Link from 'next/link';
import type { OrganizationContext } from '@prometheus/auth';

/**
 * Header pill showing which context the dashboard is acting in (E0.5): the
 * active organization with the user's role in it, or their personal account.
 * Read-only -- it links to /dashboard/organization, where switching already
 * lives. A full in-header switcher is A.6.
 */
export function OrgSwitcher({ organization }: { organization: OrganizationContext | null }) {
  return (
    <Link
      href="/dashboard/organization"
      title={organization ? `${organization.name}: manage or switch organizations` : 'Personal account: switch to or create an organization'}
      className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs transition-colors hover:border-glow/60"
    >
      <span className="max-w-[10rem] truncate font-medium text-ink">{organization?.name ?? 'Personal'}</span>
      {organization && (
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 capitalize text-ink-muted">{organization.role}</span>
      )}
    </Link>
  );
}
