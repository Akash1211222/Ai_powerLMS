'use client';

import { useQuery } from '@tanstack/react-query';
import { orgApi, type Organization } from './lms-api';

/**
 * The user's active organization. For now this is the primary (or first)
 * membership; a proper org switcher can be layered on later without changing
 * call sites.
 */
export function useActiveOrg() {
  const query = useQuery({ queryKey: ['me', 'organizations'], queryFn: orgApi.mine });
  const org: Organization | undefined = query.data?.[0];
  return { org, isLoading: query.isLoading, error: query.error };
}
