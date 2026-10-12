import Link from 'next/link';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { organizationInvitations, organizations } from '@prometheus/database';
import { Button, Card } from '@prometheus/ui';
import { acceptInvitationAction } from '../../dashboard/organization/actions';

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [invitation] = await db
    .select({
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      expiresAt: organizationInvitations.expiresAt,
      organizationName: organizations.name,
    })
    .from(organizationInvitations)
    .innerJoin(organizations, eq(organizations.id, organizationInvitations.organizationId))
    .where(
      and(
        eq(organizationInvitations.tokenHash, tokenHash),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt)
      )
    )
    .limit(1);
  const session = await auth();
  const valid = invitation && invitation.expiresAt > new Date();
  const emailMatches =
    valid && session?.user?.email?.toLowerCase() === invitation.email.toLowerCase();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
      <Card className="flex w-full flex-col gap-4">
        <p className="text-xs uppercase tracking-[0.2em] text-glow-cyan">Prometheus organization</p>
        {!valid ? (
          <><h1 className="font-display text-2xl font-semibold text-ink">Invitation unavailable</h1><p className="text-ink-muted">This invitation has expired, was revoked, or has already been accepted.</p></>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold text-ink">Join {invitation.organizationName}</h1>
            <p className="text-ink-muted">You were invited as {invitation.role} using {invitation.email}.</p>
            {emailMatches ? (
              <form action={acceptInvitationAction}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit">Accept invitation</Button>
              </form>
            ) : session?.user ? (
              <p className="text-sm text-red-400">Sign out and use {invitation.email} to accept this invitation.</p>
            ) : (
              <div className="flex gap-3">
                <Link href={`/login?redirectTo=${encodeURIComponent(`/invitations/${token}`)}`} className="rounded bg-brand-gradient px-4 py-2 text-sm font-medium text-white">Sign in to accept</Link>
                <Link href="/register" className="rounded border border-line px-4 py-2 text-sm text-ink">Create account</Link>
              </div>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
