'use client';

import { useActionState } from 'react';
import { Button, Input } from '@prometheus/ui';
import { inviteMemberAction, type InviteMemberState } from './actions';

const INITIAL_STATE: InviteMemberState = { error: null, message: null, inviteUrl: null };

export function InviteMemberForm({ organizationId, isOwner }: { organizationId: string; isOwner: boolean }) {
  const [state, action, pending] = useActionState(inviteMemberAction, INITIAL_STATE);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
        <Input name="email" type="email" required placeholder="teammate@company.com" />
        <select
          name="role"
          className="rounded border border-line bg-surface px-3 py-2 text-sm text-ink"
          defaultValue="member"
        >
          <option value="member">Member</option>
          {isOwner && <option value="admin">Admin</option>}
          {isOwner && <option value="billing">Billing</option>}
        </select>
        <Button type="submit" disabled={pending}>{pending ? 'Inviting...' : 'Invite'}</Button>
      </div>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.message && <p className="text-sm text-glow-cyan">{state.message}</p>}
      {state.inviteUrl && (
        <div className="rounded border border-line bg-surface p-3">
          <p className="mb-1 text-xs uppercase tracking-wider text-ink-muted">Invitation link</p>
          <p className="break-all font-mono text-xs text-ink">{state.inviteUrl}</p>
        </div>
      )}
    </form>
  );
}
