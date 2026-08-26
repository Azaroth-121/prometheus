import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getCurrentProfile } from '@prometheus/auth';
import { subscriptions } from '@prometheus/database';
import { createBillingPortalSession, createStripeClient } from '@prometheus/billing';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/** Redirects to Stripe's hosted Customer Portal -- cancel, payment method updates, and (if enabled in the Stripe Dashboard) plan switching, with no custom UI. */
export async function POST() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const [subscription] = await db
    .select({ providerCustomerId: subscriptions.providerCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, profile.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  if (!subscription) {
    return NextResponse.json({ error: 'No billing account found for this user.' }, { status: 400 });
  }

  const stripe = createStripeClient(env.stripeSecretKey);

  try {
    const portalSession = await createBillingPortalSession(stripe, {
      customerId: subscription.providerCustomerId,
      returnUrl: `${env.appUrl}/dashboard/billing`,
    });

    return NextResponse.json({ portal_url: portalSession.url });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create billing portal session.', detail: String(err) }, { status: 502 });
  }
}
