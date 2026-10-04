import type { OrgSummary, Profile } from '@prometheus/shared-types';

/**
 * Every org the user belongs to, with their role in each -- the single seam
 * the org UI reads through.
 *
 * STUB until E0.2/E0.4 land: there is no organizations/org_memberships table
 * yet, so every user gets exactly one synthetic personal org they own. When
 * the real schema merges, only this function's body changes (to a
 * org_memberships join) -- OrgSwitcher and resolveActiveOrg stay as they are.
 *
 * The stub id is deliberately not a UUID (`personal:<userId>`): if anything
 * ever passes it to a real uuid column by mistake, Postgres rejects it loudly
 * instead of it silently matching nothing.
 */
export async function getUserOrgs(profile: Profile): Promise<OrgSummary[]> {
  const ownerName = profile.display_name?.trim() || profile.email.split('@')[0] || 'My';
  return [{ id: `personal:${profile.id}`, name: `${ownerName}'s workspace`, role: 'owner' }];
}
