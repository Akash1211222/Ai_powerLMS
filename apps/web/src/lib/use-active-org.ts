'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orgApi, type Organization } from './lms-api';

const STORAGE_KEY = 'fca.activeOrgId';

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
  const [storedId, setStoredId] = useState<string | null>(null);

  // Read after mount: localStorage does not exist while rendering on the server.
  useEffect(() => {
    setStoredId(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const orgs = query.data ?? [];
  const org = pickActiveOrg(orgs, storedId);

  const setOrg = useCallback(
    (id: string) => {
      window.localStorage.setItem(STORAGE_KEY, id);
      setStoredId(id);
      // Nearly every query here is scoped to an organisation, so keeping the
      // cache across a switch would show one college's batches under another
      // college's name until each query happened to refetch.
      queryClient.clear();
    },
    [queryClient],
  );

  return { org, orgs, setOrg, isLoading: query.isLoading, error: query.error };
}
