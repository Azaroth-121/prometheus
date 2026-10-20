import { redirect } from 'next/navigation';
import { getCurrentProfile, requireAdmin } from '@prometheus/auth';
import { auth } from './auth';
import { db } from './db';

/** Defense-in-depth guard for each platform-admin server component. */
export async function requirePlatformAdmin() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  try {
    return requireAdmin(profile);
  } catch {
    redirect('/dashboard');
  }
}
