'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile, requireAdmin } from '@prometheus/auth';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import type { AccountStatus } from '@prometheus/shared-types';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export async function setUserStatusAction(formData: FormData) {
  const userId = String(formData.get('userId'));
  const nextStatus = String(formData.get('nextStatus')) as AccountStatus;
  const reason = String(formData.get('reason') ?? '').trim();

  const supabase = await createClient();
  const actorProfile = requireAdmin(await getCurrentProfile(supabase));

  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('id, status')
    .eq('id', userId)
    .single();
  if (targetError || !targetProfile) {
    throw new Error('User not found.');
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ status: nextStatus })
    .eq('id', userId);
  if (updateError) throw updateError;

  const serviceClient = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const ipAddress = (await headers()).get('x-forwarded-for');
  await serviceClient.from('admin_audit_logs').insert({
    admin_user_id: actorProfile.id,
    action: 'set_user_status',
    target_type: 'profile',
    target_id: userId,
    before_state: { status: targetProfile.status },
    after_state: { status: nextStatus },
    ip_address: ipAddress,
    reason: reason || null,
  });

  revalidatePath('/admin/users');
}
