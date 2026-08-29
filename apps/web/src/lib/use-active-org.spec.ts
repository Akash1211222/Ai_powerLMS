import { describe, it, expect } from 'vitest';
import { pickActiveOrg } from './use-active-org';
import type { Organization } from './lms-api';

const org = (id: string, extra: Partial<Organization> = {}): Organization => ({
  id,
  name: id,
  slug: id,
  type: 'COLLEGE',
  ...extra,
});

describe('pickActiveOrg', () => {
  it('shows nothing while the list is still loading', () => {
    expect(pickActiveOrg([], null)).toBeUndefined();
  });

  it('defaults to the primary membership, not simply the first', () => {
    const orgs = [org('second'), org('home', { isPrimary: true })];
    expect(pickActiveOrg(orgs, null)?.id).toBe('home');
  });

  it('falls back to the first when nothing is marked primary', () => {
    expect(pickActiveOrg([org('a'), org('b')], null)?.id).toBe('a');
  });

  it('honours what the user last chose', () => {
    const orgs = [org('home', { isPrimary: true }), org('xaviers')];
    expect(pickActiveOrg(orgs, 'xaviers')?.id).toBe('xaviers');
  });

  it('recovers when the stored college is no longer theirs', () => {
    // An operations lead whose portfolio was reassigned still has a stale id in
    // localStorage. Showing an empty app would look like a broken login.
    const orgs = [org('home', { isPrimary: true }), org('fergusson')];
    expect(pickActiveOrg(orgs, 'a-college-they-lost')?.id).toBe('home');
  });

  it('keeps working for the ordinary case of one membership', () => {
    expect(pickActiveOrg([org('only')], null)?.id).toBe('only');
    expect(pickActiveOrg([org('only')], 'stale')?.id).toBe('only');
  });
});
