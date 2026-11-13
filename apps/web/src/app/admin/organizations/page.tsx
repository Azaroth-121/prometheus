import Link from 'next/link';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, organizationSubscriptions, plans } from '@prometheus/database';
import { Button, Card, Input } from '@prometheus/ui';
import { needsBillingAttention, requirePlatformAdmin, SUBSCRIPTION_ATTENTION_STATUSES } from '@/lib/admin';

const PAGE_LIMIT = 100;

const STATUS_FILTERS = { all: 'Any status', active: 'Active', suspended: 'Suspended' } as const;
const BILLING_FILTERS = { all: 'Any billing', paid: 'Paid', attention: 'Payment problem', free: 'Free' } as const;

type StatusFilter = keyof typeof STATUS_FILTERS;
type BillingFilter = keyof typeof BILLING_FILTERS;

function pick<T extends string>(value: string | undefined, options: Record<T, string>, fallback: T): T {
  return value && value in options ? (value as T) : fallback;
}

/** Escapes LIKE wildcards so a search for "50%" matches that text literally. */
function likePattern(text: string) {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; billing?: string }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const status = pick<StatusFilter>(params.status, STATUS_FILTERS, 'all');
  const billing = pick<BillingFilter>(params.billing, BILLING_FILTERS, 'all');

  const conditions: SQL[] = [];
  if (q) {
    const pattern = likePattern(q);
    conditions.push(
      or(
        sql`${organizations.name} ilike ${pattern}`,
        sql`${organizations.slug} ilike ${pattern}`,
        sql`exists (select 1 from organization_members om join profiles p on p.id = om.user_id where om.organization_id = ${organizations.id} and p.email ilike ${pattern})`
      )!
    );
  }
  if (status !== 'all') conditions.push(eq(organizations.status, status));
  if (billing === 'paid') conditions.push(eq(organizationSubscriptions.status, 'active'));
  if (billing === 'attention') conditions.push(inArray(organizationSubscriptions.status, [...SUBSCRIPTION_ATTENTION_STATUSES]));
  // Free: never subscribed, or the subscription has ended. A past-due plan is a payment problem, not Free.
  if (billing === 'free') {
    conditions.push(or(isNull(organizationSubscriptions.status), inArray(organizationSubscriptions.status, ['canceled', 'incomplete_expired']))!);
  }

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      createdAt: organizations.createdAt,
      owner: sql<string | null>`(select p.email from organization_members om join profiles p on p.id = om.user_id where om.organization_id = ${organizations.id} and om.role = 'owner' limit 1)`,
      members: sql<number>`(select count(*)::int from organization_members om where om.organization_id = ${organizations.id})`,
      requests: sql<number>`(select count(*)::int from optimization_requests r where r.organization_id = ${organizations.id} and r.created_at >= now() - interval '30 days')`,
      planName: plans.name,
      subscriptionStatus: organizationSubscriptions.status,
    })
    .from(organizations)
    .leftJoin(
      organizationSubscriptions,
      sql`${organizationSubscriptions.id} = (select os.id from organization_subscriptions os where os.organization_id = ${organizations.id} order by os.current_period_end desc limit 1)`
    )
    .leftJoin(plans, eq(plans.id, organizationSubscriptions.planId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(organizations.createdAt))
    .limit(PAGE_LIMIT + 1);

  const shown = rows.slice(0, PAGE_LIMIT);
  const filtered = q !== '' || status !== 'all' || billing !== 'all';

  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="font-display text-xl font-semibold text-ink">All organizations</h2><p className="text-sm text-ink-muted">Search organizations, check their billing and suspend or reactivate them.</p></div>
      <form className="flex flex-col gap-2 sm:flex-row">
        <Input name="q" defaultValue={q} placeholder="Name, slug or member email" aria-label="Search organizations" />
        <select name="status" defaultValue={status} aria-label="Status" className="rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
          {Object.entries(STATUS_FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="billing" defaultValue={billing} aria-label="Billing" className="rounded border border-line bg-surface px-3 py-2 text-sm text-ink">
          {Object.entries(BILLING_FILTERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button type="submit" variant="secondary">Search</Button>
        {filtered && <Link href="/admin/organizations" className="self-center text-sm text-glow-cyan hover:underline">Clear</Link>}
      </form>
      <p className="text-sm text-ink-muted">
        {rows.length > PAGE_LIMIT ? `Showing the newest ${PAGE_LIMIT}. Search to narrow it down.` : `${shown.length} ${shown.length === 1 ? 'organization' : 'organizations'}`}
      </p>
      <Card className="divide-y divide-line p-0">
        {shown.map((organization) => {
          const needsAttention = needsBillingAttention(organization.subscriptionStatus);
          return (
            <Link key={organization.id} href={`/admin/organizations/${organization.id}`} className="grid gap-2 p-4 hover:bg-white/[0.02] sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <div>
                <p className="font-medium text-ink">
                  {organization.name}
                  {organization.status === 'suspended' && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-400">Suspended</span>}
                </p>
                <p className="break-all text-sm text-ink-muted">{organization.slug}{organization.owner ? ` - ${organization.owner}` : ''}</p>
              </div>
              <p className="text-sm text-ink-muted">{organization.members} members</p>
              <p className="text-sm text-ink-muted">{organization.requests} requests / 30d</p>
              <p className={`text-sm ${needsAttention ? 'text-amber-400' : 'text-ink'}`}>{organization.planName ?? 'Free'}{organization.subscriptionStatus ? ` - ${organization.subscriptionStatus.replace('_', ' ')}` : ''}</p>
            </Link>
          );
        })}
        {shown.length === 0 && <p className="p-4 text-sm text-ink-muted">{filtered ? 'No organizations match.' : 'No organizations found.'}</p>}
      </Card>
    </div>
  );
}
