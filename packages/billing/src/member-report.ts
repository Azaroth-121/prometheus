import { eq, sql } from 'drizzle-orm';
import type { Database } from '@prometheus/database';
import { optimizationRequests, organizationMembers, profiles } from '@prometheus/database';
import type { OrganizationRole } from '@prometheus/shared-types';
import { getOrganizationMemberUsage, type Queryable } from './access';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The "licenses unused for 30 / 60 days" views on the organization page (C.3). */
export const UNUSED_LICENSE_DAYS = [30, 60] as const;

export interface MemberReportRow {
  memberId: string;
  userId: string;
  role: OrganizationRole;
  email: string;
  displayName: string | null;
  joinedAt: Date;
  licenseAssignedAt: Date | null;
  /** Last optimize request made in this organization, ever. Null if they never used it here. */
  lastActiveAt: Date | null;
  requestsThisPeriod: number;
  tokensThisPeriod: number;
}

/** Each member's most recent request in this organization (any status). Members with none are absent. */
export async function getMemberLastActive(db: Queryable, organizationId: string): Promise<Map<string, Date>> {
  const rows = await db
    .select({
      userId: optimizationRequests.userId,
      lastActiveAt: sql<Date>`max(${optimizationRequests.createdAt})`.mapWith(optimizationRequests.createdAt),
    })
    .from(optimizationRequests)
    .where(eq(optimizationRequests.organizationId, organizationId))
    .groupBy(optimizationRequests.userId);
  return new Map(rows.map((row) => [row.userId, row.lastActiveAt]));
}

/** Everything the organization page and the members CSV show, oldest member first. */
export async function getOrganizationMemberReport(
  db: Database,
  organizationId: string,
  periodStart: string
): Promise<MemberReportRow[]> {
  const [members, usage, lastActive] = await Promise.all([
    db
      .select({
        memberId: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        email: profiles.email,
        displayName: profiles.displayName,
        joinedAt: organizationMembers.createdAt,
        licenseAssignedAt: organizationMembers.licenseAssignedAt,
      })
      .from(organizationMembers)
      .innerJoin(profiles, eq(profiles.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(organizationMembers.createdAt),
    getOrganizationMemberUsage(db, organizationId, periodStart),
    getMemberLastActive(db, organizationId),
  ]);
  const usageByUser = new Map(usage.map((row) => [row.userId, row]));

  return members.map((member) => ({
    ...member,
    lastActiveAt: lastActive.get(member.userId) ?? null,
    requestsThisPeriod: usageByUser.get(member.userId)?.requests ?? 0,
    tokensThisPeriod: usageByUser.get(member.userId)?.tokens ?? 0,
  }));
}

/**
 * A license is unused once its holder has gone `days` without a request,
 * counted from the later of their last request and the assignment -- so a
 * license handed out yesterday is never flagged just because it is new.
 */
export function isLicenseUnused(
  member: Pick<MemberReportRow, 'licenseAssignedAt' | 'lastActiveAt'>,
  days: number,
  now: Date = new Date()
): boolean {
  if (!member.licenseAssignedAt) return false;
  const since =
    member.lastActiveAt && member.lastActiveAt > member.licenseAssignedAt ? member.lastActiveAt : member.licenseAssignedAt;
  return now.getTime() - since.getTime() >= days * DAY_MS;
}

const ROLE_FILTERS = ['all', 'owner', 'admin', 'member', 'billing'] as const;
const LICENSE_FILTERS = ['all', 'licensed', 'unlicensed', ...UNUSED_LICENSE_DAYS.map((days) => `unused-${days}` as const)] as const;

export type MemberRoleFilter = (typeof ROLE_FILTERS)[number];
export type MemberLicenseFilter = (typeof LICENSE_FILTERS)[number];

export interface MemberFilter {
  query: string;
  role: MemberRoleFilter;
  license: MemberLicenseFilter;
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Reads the filter from the page's query string; anything unrecognized falls back to "all". */
export function parseMemberFilter(params: SearchParams): MemberFilter {
  const role = firstParam(params, 'role');
  const license = firstParam(params, 'license');
  return {
    query: firstParam(params, 'q').trim().slice(0, 100),
    role: (ROLE_FILTERS as readonly string[]).includes(role) ? (role as MemberRoleFilter) : 'all',
    license: (LICENSE_FILTERS as readonly string[]).includes(license) ? (license as MemberLicenseFilter) : 'all',
  };
}

export function isMemberFilterActive(filter: MemberFilter): boolean {
  return filter.query !== '' || filter.role !== 'all' || filter.license !== 'all';
}

/** The filter as a query string, for links that should keep it (e.g. the CSV download). */
export function memberFilterQuery(filter: MemberFilter): string {
  const params = new URLSearchParams();
  if (filter.query) params.set('q', filter.query);
  if (filter.role !== 'all') params.set('role', filter.role);
  if (filter.license !== 'all') params.set('license', filter.license);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function filterMembers<T extends Pick<MemberReportRow, 'email' | 'displayName' | 'role' | 'licenseAssignedAt' | 'lastActiveAt'>>(
  members: T[],
  filter: MemberFilter,
  now: Date = new Date()
): T[] {
  const query = filter.query.toLowerCase();
  return members.filter((member) => {
    if (query && !member.email.toLowerCase().includes(query) && !(member.displayName ?? '').toLowerCase().includes(query)) {
      return false;
    }
    if (filter.role !== 'all' && member.role !== filter.role) return false;
    switch (filter.license) {
      case 'all':
        return true;
      case 'licensed':
        return Boolean(member.licenseAssignedAt);
      case 'unlicensed':
        return !member.licenseAssignedAt;
      default:
        return isLicenseUnused(member, Number(filter.license.slice('unused-'.length)), now);
    }
  });
}

/** "Today", "Yesterday", "12 days ago", or "Never". */
export function formatLastActive(lastActiveAt: Date | null, now: Date = new Date()): string {
  if (!lastActiveAt) return 'Never';
  const days = Math.max(Math.floor((now.getTime() - lastActiveAt.getTime()) / DAY_MS), 0);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function isoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

/**
 * Quotes a CSV field when needed, and neutralizes values a spreadsheet would
 * run as a formula -- names and emails are user-entered.
 */
function csvField(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The members report download: one row per member, dates as YYYY-MM-DD (UTC), CRLF line endings. */
export function buildMemberReportCsv(rows: MemberReportRow[], now: Date = new Date()): string {
  const header = [
    'Name',
    'Email',
    'Role',
    'License',
    'License assigned',
    'Last active',
    `Unused ${UNUSED_LICENSE_DAYS[0]}+ days`,
    'Requests this period',
    'Tokens this period',
  ];
  const lines = rows.map((row) => [
    row.displayName ?? '',
    row.email,
    row.role,
    row.licenseAssignedAt ? 'Licensed' : 'No license',
    isoDate(row.licenseAssignedAt),
    isoDate(row.lastActiveAt),
    isLicenseUnused(row, UNUSED_LICENSE_DAYS[0], now) ? 'Yes' : 'No',
    row.requestsThisPeriod,
    row.tokensThisPeriod,
  ]);
  return [header, ...lines].map((line) => line.map(csvField).join(',')).join('\r\n') + '\r\n';
}
