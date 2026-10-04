/**
 * Customer-facing organization membership (Phase E0). Deliberately separate
 * from UserRole in ./roles.ts -- that one is Prometheus *staff* roles
 * (support/analyst/admin/...), this one is what a customer is inside their
 * own org. The plan explicitly says never to conflate the two.
 */
export const ORG_ROLES = ['owner', 'admin', 'member'] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * What the UI needs to know about one org the current user belongs to. The
 * JWT is expected to carry only the org id (E0.4); the name is always read
 * fresh from the database, since a name baked into a 30-day token would go
 * stale the moment an owner renames the org.
 */
export interface OrgSummary {
  id: string;
  name: string;
  /** The current user's role in this org, not a property of the org itself. */
  role: OrgRole;
}

/** Contract for GET /api/v1/orgs (the extension's view of the same data the dashboard header reads). */
export interface OrgsResponse {
  orgs: OrgSummary[];
  active_org_id: string | null;
}
