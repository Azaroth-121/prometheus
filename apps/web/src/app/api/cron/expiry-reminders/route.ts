import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, isNull, lte } from 'drizzle-orm';
import { subscriptions, profiles, plans, systemEvents } from '@prometheus/database';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

const REMINDER_WINDOW_DAYS = 5;

async function logSystemEvent(
  severity: 'info' | 'warning' | 'error',
  message: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(systemEvents).values({
    service: 'expiry_reminders_cron',
    severity,
    eventType: 'expiry_reminder',
    message,
    metadata: metadata ?? null,
  });
}

/**
 * Was triggered by Vercel Cron (attached `Authorization: Bearer $CRON_SECRET`
 * automatically once CRON_SECRET was a project env var). On Azure this is
 * triggered by a Container Apps Job on a Scheduled trigger instead -- the
 * route logic itself is unchanged, it just checks the same bearer header
 * regardless of what's calling it, since it has no human caller either way.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const dueSubscriptions = await db
    .select({
      id: subscriptions.id,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      email: profiles.email,
      displayName: profiles.displayName,
      planName: plans.name,
    })
    .from(subscriptions)
    .innerJoin(profiles, eq(subscriptions.userId, profiles.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.status, 'active'),
        isNull(subscriptions.reminderSentAt),
        lte(subscriptions.currentPeriodEnd, windowEnd)
      )
    );

  let sent = 0;

  for (const subscription of dueSubscriptions) {
    try {
      const response = await fetch(env.makeExpiryWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: subscription.email,
          display_name: subscription.displayName,
          plan_name: subscription.planName,
          expires_at: subscription.currentPeriodEnd.toISOString(),
          renew_url: `${env.appUrl}/dashboard/billing`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook responded ${response.status}`);
      }

      await db
        .update(subscriptions)
        .set({ reminderSentAt: new Date() })
        .where(eq(subscriptions.id, subscription.id));

      sent += 1;
      await logSystemEvent('info', `Sent expiry reminder to ${subscription.email}.`, {
        subscription_id: subscription.id,
      });
    } catch (webhookError) {
      await logSystemEvent(
        'error',
        `Failed to send expiry reminder: ${webhookError instanceof Error ? webhookError.message : String(webhookError)}`,
        { subscription_id: subscription.id }
      );
    }
  }

  return NextResponse.json({ checked: dueSubscriptions.length, sent });
}
