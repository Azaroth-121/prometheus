import { redirect } from 'next/navigation';
import { getCurrentProfile, requireAdmin } from '@prometheus/auth';
import { auth } from './auth';
import { db } from './db';

/** Defense-in-depth guard for each platform-admin server component. */
export async function requirePlatformAdmin() {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;
  try {
    return requireAdmin(profile);
  } catch {
    redirect('/dashboard');
  }
}

/** Stripe subscription states where the customer has a plan but isn't paying for it. */
export const SUBSCRIPTION_ATTENTION_STATUSES = ['past_due', 'unpaid', 'incomplete'] as const;

export function needsBillingAttention(status: string | null | undefined): boolean {
  return (SUBSCRIPTION_ATTENTION_STATUSES as readonly string[]).includes(status ?? '');
}

/** A Stripe Dashboard link, in test mode when the app runs on a test key. */
export function stripeDashboardUrl(path: string): string {
  const base = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
    ? 'https://dashboard.stripe.com/test'
    : 'https://dashboard.stripe.com';
  return `${base}/${path}`;
}
