import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@prometheus/database';
import { env } from '@/lib/env';

const REMINDER_WINDOW_DAYS = 5;

interface DueSubscription {
  id: string;
  current_period_end: string;
  profiles: { email: string; display_name: string | null } | null;
  plans: { name: string } | null;
}

async function logSystemEvent(
  client: SupabaseClient,
  severity: 'info' | 'warning' | 'error',
  message: string,
  metadata?: Record<string, unknown>,
) {
  await client.from('system_events').insert({
    request_id: randomUUID(),
    service: 'expiry_reminders_cron',
    severity,
    event_type: 'expiry_reminder',
    message,
    metadata,
  });
}

/**
 * Vercel Cron attaches `Authorization: Bearer $CRON_SECRET` automatically
 * once CRON_SECRET is set as a project env var — this route trusts that
 * header instead of a user session, since it has no human caller.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const client = createSupabaseServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { data: dueSubscriptions, error } = await client
    .from('subscriptions')
    .select('id, current_period_end, profiles(email, display_name), plans(name)')
    .eq('status', 'active')
    .is('reminder_sent_at', null)
    .lte('current_period_end', windowEnd.toISOString())
    .returns<DueSubscription[]>();

  if (error) {
    await logSystemEvent(client, 'error', `Failed to query due subscriptions: ${error.message}`);
    return NextResponse.json({ error: 'Query failed.' }, { status: 500 });
  }

  let sent = 0;

  for (const subscription of dueSubscriptions ?? []) {
    const email = subscription.profiles?.email;
    if (!email) {
      await logSystemEvent(client, 'warning', 'Skipped expiry reminder: subscription has no profile email.', {
        subscription_id: subscription.id,
      });
      continue;
    }

    try {
      const response = await fetch(env.makeExpiryWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          display_name: subscription.profiles?.display_name ?? null,
          plan_name: subscription.plans?.name ?? 'Prometheus',
          expires_at: subscription.current_period_end,
          renew_url: `${env.appUrl}/dashboard/billing`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook responded ${response.status}`);
      }

      await client
        .from('subscriptions')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', subscription.id);

      sent += 1;
      await logSystemEvent(client, 'info', `Sent expiry reminder to ${email}.`, {
        subscription_id: subscription.id,
      });
    } catch (webhookError) {
      await logSystemEvent(
        client,
        'error',
        `Failed to send expiry reminder: ${webhookError instanceof Error ? webhookError.message : String(webhookError)}`,
        { subscription_id: subscription.id },
      );
    }
  }

  return NextResponse.json({ checked: dueSubscriptions?.length ?? 0, sent });
}
