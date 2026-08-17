'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getCurrentProfile, requireAdmin } from '@prometheus/auth';
import { profiles, adminAuditLogs } from '@prometheus/database';
import type { AccountStatus } from '@prometheus/shared-types';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function setUserStatusAction(formData: FormData) {
  const userId = String(formData.get('userId'));
  const nextStatus = String(formData.get('nextStatus')) as AccountStatus;
  const reason = String(formData.get('reason') ?? '').trim();

  const session = await auth();
  const actorProfile = requireAdmin(session?.user?.id ? await getCurrentProfile(db, session.user.id) : null);

  const [targetProfile] = await db
    .select({ id: profiles.id, status: profiles.status })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!targetProfile) {
    throw new Error('User not found.');
  }

  await db.update(profiles).set({ status: nextStatus }).where(eq(profiles.id, userId));

  const ipAddress = (await headers()).get('x-forwarded-for');
  await db.insert(adminAuditLogs).values({
    adminUserId: actorProfile.id,
    action: 'set_user_status',
    targetType: 'profile',
    targetId: userId,
    beforeState: { status: targetProfile.status },
    afterState: { status: nextStatus },
    ipAddress: ipAddress,
    reason: reason || null,
  });

  revalidatePath('/admin/users');
}
