'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function updateDisplayNameAction(formData: FormData) {
  const displayName = String(formData.get('displayName') ?? '').trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName || null })
    .eq('id', user.id);

  if (error) throw error;

  revalidatePath('/dashboard/settings');
}
