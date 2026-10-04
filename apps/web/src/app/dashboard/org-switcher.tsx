import type { OrgSummary } from '@prometheus/shared-types';

/**
 * Org switcher, single-org stub (E0.5). Takes the full list of the user's
 * orgs even though only one exists today, so A.6 (real multi-org switching)
 * extends this component instead of replacing it. Read-only for now: it
 * shows the active org and the user's role, and deliberately offers no
 * switch action -- a fake dropdown would promise something that can't work
 * yet.
 */
export function OrgSwitcher({ orgs, activeOrgId }: { orgs: readonly OrgSummary[]; activeOrgId: string }) {
  const active = orgs.find((org) => org.id === activeOrgId);
  if (!active) return null;

  const otherCount = orgs.length - 1;

  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1 text-xs"
      title={active.name}
    >
      <span className="max-w-[10rem] truncate font-medium text-ink">{active.name}</span>
      <span className="rounded-full bg-white/10 px-1.5 py-0.5 capitalize text-ink-muted">{active.role}</span>
      {otherCount > 0 && <span className="text-ink-muted">+{otherCount}</span>}
    </div>
  );
}
