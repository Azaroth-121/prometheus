import type { SupabaseClient } from '@supabase/supabase-js';

export interface CurrentPlanInfo {
  planCode: string;
  planName: string;
  /** null for Free — Free never expires. */
  expiresAt: string | null;
}

const FREE_PLAN: CurrentPlanInfo = { planCode: 'free', planName: 'Free', expiresAt: null };

/**
 * Resolves what the caller can currently access: their most recent paid
 * period if it hasn't lapsed, otherwise Free. There's no cron job flipping
 * anyone to "expired" — a lapsed period just isn't returned as active here,
 * which is all that's needed until real usage-limit enforcement exists.
 */
export async function getCurrentPlanInfo(
  client: SupabaseClient,
  userId: string,
): Promise<CurrentPlanInfo> {
  const { data: subscription } = await client
    .from('subscriptions')
    .select('current_period_end, plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription || new Date(subscription.current_period_end) <= new Date()) {
    return FREE_PLAN;
  }

  const { data: plan } = await client
    .from('plans')
    .select('code, name')
    .eq('id', subscription.plan_id)
    .single();

  if (!plan) {
    return FREE_PLAN;
  }

  return { planCode: plan.code, planName: plan.name, expiresAt: subscription.current_period_end };
}
