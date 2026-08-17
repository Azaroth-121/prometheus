import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentProfile } from '@prometheus/auth';
import { plans } from '@prometheus/database';
import { createOrder } from '@prometheus/billing';
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

  if (!plan || Number(plan.monthlyPrice) <= 0) {
    return NextResponse.json({ error: 'Plan is not available for checkout.' }, { status: 400 });
  }

  const paypalConfig = {
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    apiBase: env.paypalApiBase,
  };

  try {
    const order = await createOrder(paypalConfig, {
      amount: Number(plan.monthlyPrice).toFixed(2),
      currency: plan.currency,
      returnUrl: `${env.appUrl}/dashboard/billing/success?plan=${plan.code}`,
      cancelUrl: `${env.appUrl}/dashboard/billing`,
    });

    const approveUrl = order.links.find((link) => link.rel === 'approve')?.href;
    if (!approveUrl) {
      return NextResponse.json({ error: 'PayPal did not return an approval link.' }, { status: 502 });
    }

    return NextResponse.json({ approve_url: approveUrl });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create PayPal order.', detail: String(err) }, { status: 502 });
  }
}
