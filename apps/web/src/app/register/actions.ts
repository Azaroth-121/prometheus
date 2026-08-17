'use server';

import { signUpWithPassword } from '@prometheus/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export interface RegisterState {
  error: string | null;
  success: boolean;
}

export async function registerAction(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || password.length < 8) {
    return { error: 'A valid email and a password of at least 8 characters are required.', success: false };
  }

  let verificationToken: string;
  try {
    const result = await signUpWithPassword(db, { email, password });
    verificationToken = result.verificationToken;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not create the account.',
      success: false,
    };
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
