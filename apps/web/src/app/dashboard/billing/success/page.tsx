import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getCurrentProfile } from '@prometheus/auth';
import { plans, subscriptions } from '@prometheus/database';
import { captureOrder } from '@prometheus/billing';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

const ACCESS_PERIOD_DAYS = 30;

/**
 * Activates access on the redirect back from PayPal's approval page,
 * independent of webhook delivery (webhooks need a publicly reachable URL —
 * see documentation/architecture/implementation-notes.md). `token` is
 * PayPal's own param (the order id); `plan` is ours, appended when creating
 * the order.
 */
export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; plan?: string }>;
}) {
  const { token: orderId, plan: planCode } = await searchParams;
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;

  if (!profile) redirect('/login');
  if (!orderId || !planCode) redirect('/dashboard/billing');

  const paypalConfig = {
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    apiBase: env.paypalApiBase,
  };

  const order = await captureOrder(paypalConfig, orderId);

  if (order.status !== 'COMPLETED') {
    redirect('/dashboard/billing');
  }

  const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.code, planCode)).limit(1);

  if (plan) {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + ACCESS_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    await db
      .insert(subscriptions)
      .values({
        userId: profile.id,
        provider: 'paypal',
        providerCustomerId: order.payer?.payer_id ?? 'unknown',
        // Reusing this column for the order/transaction id — payments here
        // are one-time, not recurring subscriptions (see access.ts).
        providerSubscriptionId: order.id,
        planId: plan.id,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      })
      .onConflictDoUpdate({
        target: subscriptions.providerSubscriptionId,
        set: {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
  }

  redirect('/dashboard/billing');
}
