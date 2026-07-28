import { Button, Card, Input } from '@prometheus/ui';
import { createClient } from '@/lib/supabase/server';
import { setUserStatusAction } from './actions';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('profiles')
    .select('id, email, display_name, role, status')
    .order('created_at', { ascending: false })
    .limit(50);
  if (q) {
    query = query.ilike('email', `%${q}%`);
  }
  const { data: users } = await query;

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2">
        <Input name="q" defaultValue={q ?? ''} placeholder="Search by email" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <Card className="flex flex-col divide-y p-0">
        {(users ?? []).map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{user.email}</p>
              <p className="text-sm text-gray-600">
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
        {(users ?? []).length === 0 && (
          <p className="p-4 text-sm text-gray-600">No users found.</p>
        )}
      </Card>
    </div>
  );
}
