'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { profiles } from '@prometheus/database';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function updateDisplayNameAction(formData: FormData) {
  const displayName = String(formData.get('displayName') ?? '').trim();

  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Not authenticated.');
  }

  await db
    .update(profiles)
    .set({ displayName: displayName || null })
    .where(eq(profiles.id, session.user.id));

  revalidatePath('/dashboard/settings');
}
