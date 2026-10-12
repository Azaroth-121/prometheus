export const USER_ROLES = ['user', 'support', 'analyst', 'admin', 'super_admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLES: readonly UserRole[] = ['admin', 'super_admin'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export const ORGANIZATION_ROLES = ['owner', 'admin', 'member', 'billing'] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const ORGANIZATION_MANAGEMENT_ROLES: readonly OrganizationRole[] = ['owner', 'admin'];
export const ORGANIZATION_BILLING_ROLES: readonly OrganizationRole[] = ['owner', 'billing'];

export function canManageOrganization(role: OrganizationRole): boolean {
  return ORGANIZATION_MANAGEMENT_ROLES.includes(role);
}

export function canManageOrganizationBilling(role: OrganizationRole): boolean {
  return ORGANIZATION_BILLING_ROLES.includes(role);
}
