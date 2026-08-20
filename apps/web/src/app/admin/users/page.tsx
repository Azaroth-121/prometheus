import { desc, ilike } from 'drizzle-orm';
import { profiles } from '@prometheus/database';
import { Button, Card, Input } from '@prometheus/ui';
import { db } from '@/lib/db';
import { setUserStatusAction } from './actions';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const users = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      role: profiles.role,
      status: profiles.status,
    })
    .from(profiles)
    .where(q ? ilike(profiles.email, `%${q}%`) : undefined)
    .orderBy(desc(profiles.createdAt))
    .limit(50);

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2">
        <Input name="q" defaultValue={q ?? ''} placeholder="Search by email" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <Card className="flex flex-col divide-y divide-line p-0">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-ink">{user.email}</p>
              <p className="text-sm text-ink-muted">
                {user.role} · {user.status}
              </p>
            </div>
            <form action={setUserStatusAction} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <input
                type="hidden"
                name="nextStatus"
                value={user.status === 'active' ? 'suspended' : 'active'}
              />
              <Input name="reason" placeholder="Reason (optional)" className="w-40" />
              <Button type="submit" variant={user.status === 'active' ? 'secondary' : 'primary'}>
                {user.status === 'active' ? 'Suspend' : 'Reactivate'}
              </Button>
            </form>
          </div>
        ))}
        {users.length === 0 && <p className="p-4 text-sm text-ink-muted">No users found.</p>}
      </Card>
    </div>
  );
}
