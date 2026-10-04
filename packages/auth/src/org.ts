import type { OrgSummary } from '@prometheus/shared-types';

/**
 * Picks which org the current request acts as. `claimedOrgId` is whatever
 * the session/JWT says (the E0.4 `orgId` claim, or later a switcher choice)
 * -- it is only honored if it's an org the user actually belongs to, per
 * `orgs`, which must come from a server-side membership lookup. A claimed id
 * with no matching membership falls back to the user's first org rather than
 * being trusted, so a stale or tampered claim can never select an org the
 * user isn't in.
 *
 * Returns null when the user has no org at all (e.g. an account created
 * before the E0.2 migration backfills memberships).
 */
export function resolveActiveOrg(orgs: readonly OrgSummary[], claimedOrgId?: string | null): OrgSummary | null {
  if (claimedOrgId) {
    const claimed = orgs.find((org) => org.id === claimedOrgId);
    if (claimed) return claimed;
  }
  return orgs[0] ?? null;
}
