import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getActiveOrganization, getCurrentProfile, requireOrganizationBillingManager } from '@prometheus/auth';
import { organizationSubscriptions, subscriptions } from '@prometheus/database';
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

  const activeOrganization = await getActiveOrganization(db, profile.id);
  if (activeOrganization) {
    try {
      await requireOrganizationBillingManager(db, profile.id, activeOrganization.id);
    } catch {
      return NextResponse.json({ error: 'Only the organization owner or billing manager can manage billing.' }, { status: 403 });
    }
  }

  const [subscription] = activeOrganization
    ? await db
        .select({ providerCustomerId: organizationSubscriptions.providerCustomerId })
        .from(organizationSubscriptions)
        .where(eq(organizationSubscriptions.organizationId, activeOrganization.id))
        .orderBy(desc(organizationSubscriptions.createdAt))
        .limit(1)
    : await db
        .select({ providerCustomerId: subscriptions.providerCustomerId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, profile.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);

  if (!subscription) {
    return NextResponse.json({ error: 'No billing account found for this billing scope.' }, { status: 400 });
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
