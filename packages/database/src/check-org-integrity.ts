import { Client } from 'pg';

/** Read-only, point-in-time checks for E0 and database cutovers. */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

    const count = async (query: string): Promise<number> => {
      const result = await client.query<{ count: string }>(query);
      return Number(result.rows[0]?.count ?? 0);
    };

    const totals = {
      profiles: await count('select count(*) from profiles'),
      organizations: await count('select count(*) from organizations'),
      organizationMembers: await count('select count(*) from organization_members'),
      individualSubscriptions: await count('select count(*) from subscriptions'),
      organizationSubscriptions: await count('select count(*) from organization_subscriptions'),
      individualRequests: await count('select count(*) from optimization_requests where organization_id is null'),
      organizationRequests: await count('select count(*) from optimization_requests where organization_id is not null'),
    };

    const violations = {
      organizationsWithoutExactlyOneOwner: await count(`
        select count(*) from organizations o
        where (select count(*) from organization_members m
               where m.organization_id = o.id and m.role = 'owner') <> 1
      `),
      activeOrganizationWithoutMembership: await count(`
        select count(*) from profiles p
        where p.active_organization_id is not null
          and not exists (
            select 1 from organization_members m
            where m.user_id = p.id and m.organization_id = p.active_organization_id
          )
      `),
      organizationRequestsWithoutOrganization: await count(`
        select count(*) from optimization_requests r
        left join organizations o on o.id = r.organization_id
        where r.organization_id is not null and o.id is null
      `),
      invalidIndividualSubscriptionPeriods: await count(`
        select count(*) from subscriptions where current_period_end <= current_period_start
      `),
      invalidOrganizationSubscriptionPeriods: await count(`
        select count(*) from organization_subscriptions where current_period_end <= current_period_start
      `),
    };

    await client.query('COMMIT');
    const result = { checkedAt: new Date().toISOString(), totals, violations };
    console.log(JSON.stringify(result, null, 2));
    if (Object.values(violations).some((value) => value > 0)) process.exitCode = 2;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
