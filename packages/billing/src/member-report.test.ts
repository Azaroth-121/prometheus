import { describe, expect, it } from 'vitest';
import {
  buildMemberReportCsv,
  filterMembers,
  formatLastActive,
  isLicenseUnused,
  memberFilterQuery,
  parseMemberFilter,
  type MemberReportRow,
} from './member-report';

const NOW = new Date('2026-10-31T12:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function member(overrides: Partial<MemberReportRow>): MemberReportRow {
  return {
    memberId: 'm1',
    userId: 'u1',
    role: 'member',
    email: 'casey@example.com',
    displayName: 'Casey Lee',
    joinedAt: daysAgo(100),
    licenseAssignedAt: daysAgo(90),
    lastActiveAt: daysAgo(2),
    requestsThisPeriod: 4,
    tokensThisPeriod: 1200,
    ...overrides,
  };
}

describe('isLicenseUnused', () => {
  it('flags a licensed member with no request in the window', () => {
    expect(isLicenseUnused(member({ lastActiveAt: daysAgo(31) }), 30, NOW)).toBe(true);
    expect(isLicenseUnused(member({ lastActiveAt: daysAgo(31) }), 60, NOW)).toBe(false);
  });

  it('flags a license that was never used once it is old enough', () => {
    expect(isLicenseUnused(member({ lastActiveAt: null, licenseAssignedAt: daysAgo(45) }), 30, NOW)).toBe(true);
  });

  it('does not flag a license assigned recently, even if the holder was idle before', () => {
    expect(isLicenseUnused(member({ lastActiveAt: daysAgo(200), licenseAssignedAt: daysAgo(3) }), 30, NOW)).toBe(false);
    expect(isLicenseUnused(member({ lastActiveAt: null, licenseAssignedAt: daysAgo(3) }), 30, NOW)).toBe(false);
  });

  it('never flags a member without a license', () => {
    expect(isLicenseUnused(member({ licenseAssignedAt: null, lastActiveAt: null }), 30, NOW)).toBe(false);
  });
});

describe('parseMemberFilter', () => {
  it('reads the query string and falls back to "all" for unknown values', () => {
    expect(parseMemberFilter({ q: '  casey ', role: 'admin', license: 'unused-60' })).toEqual({
      query: 'casey',
      role: 'admin',
      license: 'unused-60',
    });
    expect(parseMemberFilter({ role: 'superuser', license: 'unused-7' })).toEqual({ query: '', role: 'all', license: 'all' });
    expect(parseMemberFilter({ q: ['first', 'second'] }).query).toBe('first');
  });

  it('round-trips through memberFilterQuery', () => {
    expect(memberFilterQuery({ query: 'a b', role: 'all', license: 'unused-30' })).toBe('?q=a+b&license=unused-30');
    expect(memberFilterQuery({ query: '', role: 'all', license: 'all' })).toBe('');
  });
});

describe('filterMembers', () => {
  const members = [
    member({ memberId: 'active', email: 'ana@example.com', displayName: 'Ana' }),
    member({ memberId: 'idle', email: 'ben@example.com', displayName: 'Ben', lastActiveAt: daysAgo(40) }),
    member({ memberId: 'gone', email: 'cy@example.com', displayName: null, lastActiveAt: daysAgo(70) }),
    member({ memberId: 'none', email: 'dee@example.com', displayName: 'Dee', role: 'admin', licenseAssignedAt: null }),
  ];
  const ids = (filter: Partial<Parameters<typeof filterMembers>[1]>) =>
    filterMembers(members, { query: '', role: 'all', license: 'all', ...filter }, NOW).map((row) => row.memberId);

  it('searches name and email, ignoring case', () => {
    expect(ids({ query: 'BEN' })).toEqual(['idle']);
    expect(ids({ query: 'cy@' })).toEqual(['gone']);
  });

  it('filters by role and license state', () => {
    expect(ids({ role: 'admin' })).toEqual(['none']);
    expect(ids({ license: 'unlicensed' })).toEqual(['none']);
    expect(ids({ license: 'licensed' })).toEqual(['active', 'idle', 'gone']);
    expect(ids({ license: 'unused-30' })).toEqual(['idle', 'gone']);
    expect(ids({ license: 'unused-60' })).toEqual(['gone']);
  });
});

describe('formatLastActive', () => {
  it('describes the gap in days', () => {
    expect(formatLastActive(null, NOW)).toBe('Never');
    expect(formatLastActive(daysAgo(0.5), NOW)).toBe('Today');
    expect(formatLastActive(daysAgo(1), NOW)).toBe('Yesterday');
    expect(formatLastActive(daysAgo(12), NOW)).toBe('12 days ago');
  });
});

describe('buildMemberReportCsv', () => {
  it('writes a header and one row per member', () => {
    const csv = buildMemberReportCsv([member({ lastActiveAt: daysAgo(40) })], NOW);

    expect(csv.split('\r\n')).toEqual([
      'Name,Email,Role,License,License assigned,Last active,Unused 30+ days,Requests this period,Tokens this period',
      'Casey Lee,casey@example.com,member,Licensed,2026-08-02,2026-09-21,Yes,4,1200',
      '',
    ]);
  });

  it('quotes commas and quotes, and stops names from running as formulas', () => {
    const csv = buildMemberReportCsv(
      [member({ displayName: 'Lee, "CJ"', licenseAssignedAt: null, lastActiveAt: null }), member({ displayName: '=HYPERLINK("x")' })],
      NOW
    );
    const [, first, second] = csv.split('\r\n');

    expect(first).toBe('"Lee, ""CJ""",casey@example.com,member,No license,,,No,4,1200');
    expect(second?.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
  });
});
