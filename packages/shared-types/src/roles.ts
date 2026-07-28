export const USER_ROLES = ['user', 'support', 'analyst', 'admin', 'super_admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLES: readonly UserRole[] = ['admin', 'super_admin'];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}
