export interface DashboardSubscription {
  id: string;
  status: string;
  createdAt: Date;
  periodEnd: Date;
  plan: string;
  price: string;
  currency: string;
}

export function summarizeSubscriptions(
  organizationRows: DashboardSubscription[],
  individualRows: DashboardSubscription[],
  now: Date,
  since: Date
) {
  const organizationIds = new Set(organizationRows.map((row) => row.id));
  const rows = [
    ...organizationRows.map((row) => ({ ...row, scope: 'Organization' })),
    ...individualRows
      .filter((row) => !organizationIds.has(row.id))
      .map((row) => ({ ...row, scope: 'Individual' })),
  ];
  const active = rows.filter((row) => row.status === 'active' && row.periodEnd > now);
  const planMix = new Map<string, number>();
  for (const row of active) {
    const key = `${row.scope} · ${row.plan}`;
    planMix.set(key, (planMix.get(key) ?? 0) + 1);
  }

  return {
    activeCount: active.length,
    newCount: rows.filter((row) => row.createdAt >= since).length,
    canceledCount: rows.filter((row) => row.status === 'canceled').length,
    monthlyUsdValue: active
      .filter((row) => row.currency.toLowerCase() === 'usd')
      .reduce((sum, row) => sum + Number(row.price), 0),
    excludedNonUsdCount: active.filter((row) => row.currency.toLowerCase() !== 'usd').length,
    planMix,
  };
}
