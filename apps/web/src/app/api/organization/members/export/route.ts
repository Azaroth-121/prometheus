import { NextResponse, type NextRequest } from 'next/server';
import { getActiveOrganization, getCurrentProfile, requireOrganizationManager } from '@prometheus/auth';
import {
  buildMemberReportCsv,
  filterMembers,
  getCurrentPlanInfo,
  getOrganizationMemberReport,
  isMemberFilterActive,
  parseMemberFilter,
} from '@prometheus/billing';
import { adminAuditLogs } from '@prometheus/database';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * The organization page's "Download CSV": the active organization's members,
 * licenses and last activity, narrowed by the same filter the page shows.
 * Owners and admins only, and every download is written to the audit log.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const profile = session?.user?.id ? await getCurrentProfile(db, session.user.id) : null;

  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const activeOrganization = await getActiveOrganization(db, profile.id);
  if (!activeOrganization) {
    return NextResponse.json({ error: 'Switch to an organization first.' }, { status: 400 });
  }

  try {
    await requireOrganizationManager(db, profile.id, activeOrganization.id);
  } catch {
    return NextResponse.json({ error: 'Only organization owners and admins can download the member list.' }, { status: 403 });
  }

  const now = new Date();
  const filter = parseMemberFilter(Object.fromEntries(request.nextUrl.searchParams));
  const plan = await getCurrentPlanInfo(db, profile.id);
  const rows = filterMembers(await getOrganizationMemberReport(db, activeOrganization.id, plan.periodStart), filter, now);

  await db.insert(adminAuditLogs).values({
    adminUserId: profile.id,
    organizationId: activeOrganization.id,
    action: 'export_organization_members',
    targetType: 'organization',
    targetId: activeOrganization.id,
    afterState: { rows: rows.length, ...(isMemberFilterActive(filter) ? { filter } : {}) },
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  // The byte-order mark makes Excel read names with accents as UTF-8.
  return new NextResponse(`﻿${buildMemberReportCsv(rows, now)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${activeOrganization.slug}-members-${now.toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
