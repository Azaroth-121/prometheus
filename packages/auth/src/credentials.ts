import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { profiles } from '@prometheus/database';
import type { Profile } from '@prometheus/shared-types';
import { toProfile } from './profile-mapper';

const BCRYPT_ROUNDS = 12;
const EMAIL_VERIFICATION_TTL_HOURS = 24;

export interface SignUpParams {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Creates a new profile row directly -- this is application code's
 * replacement for Supabase's `handle_new_user()` trigger, which used to
 * auto-create a profiles row whenever a new auth.users row appeared. There's
 * no auth.users table anymore, so the insert has to happen explicitly here,
 * at sign-up time, instead of reactively via a database trigger.
 *
 * Returns the new profile plus the raw verification token, so the caller
 * (the sign-up route) can email it via the same Make.com webhook pattern
 * already used for expiry reminders. The token is a random opaque value, not
 * a password, so storing/comparing it in plaintext is fine -- unlike a
 * password, seeing the column doesn't make it meaningfully easier to guess.
 */
export async function signUpWithPassword(
  db: Database,
  params: SignUpParams
): Promise<{ profile: Profile; verificationToken: string }> {
  const existing = await db.select().from(profiles).where(eq(profiles.email, params.email)).limit(1);
  if (existing.length > 0) {
    throw new Error('An account with this email already exists.');
  }

  const passwordHash = await hashPassword(params.password);
  const verificationToken = randomBytes(32).toString('hex');
  const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  const [row] = await db
    .insert(profiles)
    .values({
      email: params.email,
      displayName: params.displayName ?? null,
      passwordHash,
      emailVerificationToken: verificationToken,
      emailVerificationExpiresAt: verificationExpiresAt,
    })
    .returning();

  if (!row) {
    throw new Error('Failed to create the account.');
  }

  return { profile: toProfile(row), verificationToken };
}

/**
 * Verifies email + password against the stored hash. Used by both NextAuth's
 * Credentials `authorize()` callback (web app sessions) and the extension's
 * bearer-token issuance endpoint (POST /api/v1/auth/token) -- the one place
 * both auth surfaces share real logic, rather than each reimplementing
 * password verification independently.
 */
export async function verifyCredentials(db: Database, params: SignInParams): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.email, params.email)).limit(1);
  if (!row) return null;

  const valid = await verifyPassword(params.password, row.passwordHash);
  if (!valid) return null;

  if (row.status !== 'active') return null;

  await db.update(profiles).set({ lastLoginAt: new Date() }).where(eq(profiles.id, row.id));

  return toProfile(row);
}

export async function verifyEmailToken(db: Database, token: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.emailVerificationToken, token)).limit(1);
  if (!row) return null;
  if (!row.emailVerificationExpiresAt || row.emailVerificationExpiresAt < new Date()) return null;

  const [updated] = await db
    .update(profiles)
    .set({ emailVerifiedAt: new Date(), emailVerificationToken: null, emailVerificationExpiresAt: null })
    .where(eq(profiles.id, row.id))
    .returning();

  if (!updated) return null;

  return toProfile(updated);
}
