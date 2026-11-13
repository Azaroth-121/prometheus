'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getCurrentProfile,
  OrganizationStatusError,
  requireAdmin,
  setOrganizationStatus,
  type OrganizationStatus,
} from '@prometheus/auth';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/** Suspends or reactivates an organization from its admin detail page (C.4). */
export async function setOrganizationStatusAction(formData: FormData) {
  const organizationId = String(formData.get('organizationId'));
  const nextStatus = String(formData.get('nextStatus')) as OrganizationStatus;
  const reason = String(formData.get('reason') ?? '');

  const session = await auth();
  const actor = requireAdmin(session?.user?.id ? await getCurrentProfile(db, session.user.id) : null);

  // x-forwarded-for can list every proxy hop ("client, proxy1, ..."); the
  // audit column is inet, so keep only the client address.
  const ipAddress = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null;

  const detailPath = `/admin/organizations/${encodeURIComponent(organizationId)}`;
  try {
    await setOrganizationStatus(db, { organizationId, nextStatus, actorId: actor.id, reason, ipAddress });
  } catch (error) {
    if (error instanceof OrganizationStatusError) {
      redirect(`${detailPath}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath('/admin/organizations');
  revalidatePath('/admin/audit');
  redirect(`${detailPath}?updated=${nextStatus}`);
}
