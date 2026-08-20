import Link from 'next/link';
import { verifyEmailToken } from '@prometheus/auth';
import { db } from '@/lib/db';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const profile = token ? await verifyEmailToken(db, token) : null;

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24 text-center">
      {profile ? (
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">Email verified</h1>
          <p className="text-ink-muted">Your address is confirmed. You can sign in now.</p>
          <Link href="/login" className="text-glow-cyan hover:underline">
            Sign in
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">Link expired or invalid</h1>
          <p className="text-ink-muted">This verification link is no longer valid.</p>
        </>
      )}
    </main>
  );
}
