'use server';

import { signUpWithPassword } from '@prometheus/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export interface RegisterState {
  error: string | null;
  success: boolean;
}

// Below this, a submission is faster than a person could plausibly have read
// the form and typed a password -- a bot calling the action directly, not a
// real sign-up. Paired with the "company" honeypot field below.
const MIN_HUMAN_SUBMIT_MS = 1500;

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const honeypot = String(formData.get('company') ?? '');
  const startedAt = Number(formData.get('startedAt') ?? 0);
  if (honeypot !== '' || !startedAt || Date.now() - startedAt < MIN_HUMAN_SUBMIT_MS) {
    // Report success without creating an account -- doesn't tip off the bot
    // that it was detected, and avoids revealing which field is the honeypot.
    return { error: null, success: true };
  }

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('displayName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const companyName = String(formData.get('companyName') ?? '').trim();
  const referralSource = String(formData.get('referralSource') ?? '').trim();

  if (!email || password.length < 8) {
    return { error: 'A valid email and a password of at least 8 characters are required.', success: false };
  }
  if (!displayName || !phone || !companyName || !referralSource) {
    return { error: 'Name, phone, company, and how you heard about us are all required.', success: false };
  }

  let verificationToken: string;
  try {
    const result = await signUpWithPassword(db, { email, password, displayName, phone, companyName, referralSource });
    verificationToken = result.verificationToken;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not create the account.',
      success: false,
    };
  }

  // Fire-and-forget notification so sales/support knows immediately when
  // someone signs up -- same optional-webhook pattern as the organization
  // invite email (apps/web/src/app/dashboard/organization/actions.ts):
  // reads straight from process.env rather than env.ts's required() getter,
  // since this is a nice-to-have notification, not something sign-up itself
  // should ever fail over.
  const signupWebhookUrl = process.env.MAKE_SIGNUP_NOTIFICATION_WEBHOOK_URL;
  if (signupWebhookUrl) {
    try {
      await fetch(signupWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: displayName, phone, company_name: companyName, referral_source: referralSource }),
      });
    } catch {
      // Best-effort -- a notification failure must never block sign-up.
    }
  }

  // Same Make.com-webhook-sends-the-email pattern already used for expiry
  // reminders -- no in-repo email SDK, delegated to Make.com both times.
  const verifyUrl = `${env.appUrl}/verify-email?token=${verificationToken}`;
  try {
    await fetch(env.makeVerificationWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, verify_url: verifyUrl }),
    });
  } catch {
    // The account exists either way; a delivery failure here shouldn't block
    // sign-up. The user can request a fresh verification link (not yet
    // built -- worth adding to the admin/support toolset).
  }

  return { error: null, success: true };
}
