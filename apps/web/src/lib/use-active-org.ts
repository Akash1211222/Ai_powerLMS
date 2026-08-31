'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orgApi, type Organization } from './lms-api';

const STORAGE_KEY = 'fca.activeOrgId';

/**
 * The chosen organisation, shared by every component that asks.
 *
 * This was component-local state, which meant each caller of the hook kept its
 * own copy: switching college updated the switcher and nothing else. The
 * visible symptom was the branding staying on the previous college, but the
 * real hazard is worse — the header can name one college while the page beside
 * it is still scoped to another, and nothing on screen says which one the data
 * belongs to.
 *
 * A module-level value with subscribers gives every caller the same answer and
 * re-renders all of them together, without threading a provider through a tree
 * where the hook is already used in a dozen unrelated places.
 */
let activeOrgId: string | null = null;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Reads through to localStorage once, then from memory.
 *
 * getSnapshot is called on every render and must return a stable value or
 * React loops, so touching storage each time is not an option.
 */
function getSnapshot(): string | null {
  if (activeOrgId === null && typeof window !== 'undefined') {
    activeOrgId = window.localStorage.getItem(STORAGE_KEY);
  }
  return activeOrgId;
}

/** Nothing is stored during a server render. */
const getServerSnapshot = () => null;

/** Test seam: drops the shared choice so one spec cannot leak into the next. */
export function __resetActiveOrg() {
  activeOrgId = null;
  listeners.clear();
}

/**
 * Which organisation the user is currently looking at.
 *
 * Most people belong to exactly one and never think about this. An operations
 * lead belongs to several — their portfolio of colleges — and needs to move
 * between them, which is what makes the choice worth storing.
 */

/**
 * Resolves the organisation to show, given what the user belongs to and what
 * they last chose.
 *
 * Kept pure so the awkward cases can be tested directly: a stored choice that
 * no longer exists (a college reassigned to somebody else), an empty list while
 * the request is in flight, and the first visit with nothing stored.
 */
export function pickActiveOrg(
  orgs: Organization[],
  storedId: string | null,
): Organization | undefined {
  if (orgs.length === 0) return undefined;
  const stored = storedId ? orgs.find((o) => o.id === storedId) : undefined;
  // A stored id that is no longer in the list means the membership went away.
  // Fall back rather than showing nothing.
  return stored ?? orgs.find((o) => o.isPrimary) ?? orgs[0];
}

export function useActiveOrg() {
  const query = useQuery({ queryKey: ['me', 'organizations'], queryFn: orgApi.mine });
  const queryClient = useQueryClient();
  const storedId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const orgs = query.data ?? [];
  const org = pickActiveOrg(orgs, storedId);

  const setOrg = useCallback(
    (id: string) => {
      window.localStorage.setItem(STORAGE_KEY, id);
      activeOrgId = id;
      for (const fn of listeners) fn();
      // Nearly every query here is scoped to an organisation, so keeping the
      // cache across a switch would show one college's batches under another
      // college's name until each query happened to refetch.
      queryClient.clear();
    },
    [queryClient],
  );

  return { org, orgs, setOrg, isLoading: query.isLoading, error: query.error };
}
