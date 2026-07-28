import { isAdminRole, type UserRole } from '@prometheus/shared-types';
import type { Profile } from '@prometheus/shared-types';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Throws unless the profile's role is in `allowed`. Route handlers call
 * getCurrentProfile() first, then pass the result here before doing
 * anything role-gated (admin panel, prompt-config publishing, etc.).
 */
export function requireRole(profile: Profile | null, allowed: readonly UserRole[]): Profile {
  if (!profile || profile.status !== 'active' || !allowed.includes(profile.role)) {
    throw new UnauthorizedError();
  }
  return profile;
}

export function requireAdmin(profile: Profile | null): Profile {
  if (!profile || profile.status !== 'active' || !isAdminRole(profile.role)) {
    throw new UnauthorizedError();
  }
  return profile;
}
