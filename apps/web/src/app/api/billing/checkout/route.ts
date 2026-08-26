import { NextResponse, type NextRequest } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getCurrentProfile } from '@prometheus/auth';
import { plans, subscriptions } from '@prometheus/database';
import { createCheckoutSession, createStripeClient } from '@prometheus/billing';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export async function POST(request: NextRequest) {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body: { planCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400 });
  }

  if (!body.planCode) {
    return NextResponse.json({ error: '"planCode" is required.' }, { status: 400 });
  }

  const [plan] = await db.select().from(plans).where(eq(plans.code, body.planCode)).limit(1);

  if (!plan || !plan.providerPlanId) {
    return NextResponse.json({ error: 'Plan is not available for checkout.' }, { status: 400 });
  }

  // Reuse the same Stripe Customer across purchases/upgrades instead of
  // letting Stripe create a new one every time.
  const [priorSubscription] = await db
    .select({ providerCustomerId: subscriptions.providerCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, profile.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const stripe = createStripeClient(env.stripeSecretKey);

  try {
    const checkoutSession = await createCheckoutSession(stripe, {
      customerId: priorSubscription?.providerCustomerId ?? null,
      customerEmail: profile.email,
      userId: profile.id,
      priceId: plan.providerPlanId,
      successUrl: `${env.appUrl}/dashboard/billing/success`,
      cancelUrl: `${env.appUrl}/dashboard/billing`,
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 });
    }

    return NextResponse.json({ checkout_url: checkoutSession.url });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create checkout session.', detail: String(err) }, { status: 502 });
  }
}
