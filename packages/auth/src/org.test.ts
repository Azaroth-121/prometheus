import { describe, expect, it } from 'vitest';
import type { OrgSummary } from '@prometheus/shared-types';
import { resolveActiveOrg } from './org';

const ACME: OrgSummary = { id: 'org-acme', name: 'Acme', role: 'owner' };
const GLOBEX: OrgSummary = { id: 'org-globex', name: 'Globex', role: 'member' };

describe('resolveActiveOrg', () => {
  it('returns null when the user belongs to no org', () => {
    expect(resolveActiveOrg([])).toBeNull();
    expect(resolveActiveOrg([], 'org-acme')).toBeNull();
  });

  it('defaults to the first org when nothing is claimed', () => {
    expect(resolveActiveOrg([ACME, GLOBEX])).toBe(ACME);
    expect(resolveActiveOrg([ACME, GLOBEX], null)).toBe(ACME);
  });

  it('honors a claimed org the user is a member of', () => {
    expect(resolveActiveOrg([ACME, GLOBEX], 'org-globex')).toBe(GLOBEX);
  });

  it('never honors a claimed org the user is not a member of', () => {
    expect(resolveActiveOrg([ACME, GLOBEX], 'org-someone-else')).toBe(ACME);
  });
});
