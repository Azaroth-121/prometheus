import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getActiveOrganization, getCurrentProfile, requireOrganizationBillingManager } from '@prometheus/auth';
import { adminAuditLogs, organizationSubscriptions } from '@prometheus/database';
import {
  changeSubscriptionQuantity,
  createStripeClient,
  getLicenseSummary,
  LicenseError,
  parseLicenseQuantity,
  withLicenseLock,
} from '@prometheus/billing';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Changes how many licenses the active organization pays for (ADR-004).
 * Runs under the organization's license lock so no one can assign a license
 * between the "not below assigned" check and the Stripe update. The new count
 * is written from Stripe's own response; if that write is lost, the
 * customer.subscription.updated webhook carries the same quantity.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body: { quantity?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400 });
  }

  const activeOrganization = await getActiveOrganization(db, profile.id);
  if (!activeOrganization) {
    return NextResponse.json({ error: 'Switch to an organization to change its licenses.' }, { status: 400 });
  }

  try {
    await requireOrganizationBillingManager(db, profile.id, activeOrganization.id);
  } catch {
    return NextResponse.json({ error: 'Only the organization owner or billing manager can change licenses.' }, { status: 403 });
  }

  if (body.quantity === undefined) {
    return NextResponse.json({ error: '"quantity" is required.' }, { status: 400 });
  }
  const requested = parseLicenseQuantity(body.quantity, 'organization');
  if (!requested.ok) {
    return NextResponse.json({ error: requested.error }, { status: 400 });
  }

  const stripe = createStripeClient(env.stripeSecretKey);

  try {
    const result = await withLicenseLock(db, activeOrganization.id, async (tx) => {
      const summary = await getLicenseSummary(tx, activeOrganization.id);
      if (!summary.providerSubscriptionId) {
        throw new LicenseError('Subscribe to a plan before changing licenses.');
      }
      if (requested.quantity < summary.assigned) {
        throw new LicenseError(
          `${summary.assigned} licenses are assigned. Remove licenses from members before going below that.`
        );
      }

      const change = await changeSubscriptionQuantity(stripe, summary.providerSubscriptionId, requested.quantity);
      if (change.quantity !== summary.purchased) {
        await tx
          .update(organizationSubscriptions)
          .set({ seatQuantity: change.quantity, updatedAt: new Date() })
          .where(eq(organizationSubscriptions.providerSubscriptionId, summary.providerSubscriptionId));
        await tx.insert(adminAuditLogs).values({
          adminUserId: profile.id,
          organizationId: activeOrganization.id,
          action: 'change_organization_licenses',
          targetType: 'organization_subscription',
          targetId: summary.providerSubscriptionId,
          beforeState: { seatQuantity: summary.purchased },
          afterState: { seatQuantity: change.quantity },
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        });
      }

      return { purchased: change.quantity, assigned: summary.assigned, pendingPayment: change.pendingPayment };
    });

    return NextResponse.json({
      purchased: result.purchased,
      assigned: result.assigned,
      available: Math.max(result.purchased - result.assigned, 0),
      pending_payment: result.pendingPayment,
    });
  } catch (err) {
    if (err instanceof LicenseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update licenses.', detail: String(err) }, { status: 502 });
  }
}
