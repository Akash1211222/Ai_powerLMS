'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { adminApi } from '@/lib/lms-learning-api';

const GRANTABLE = [
  'STUDENT',
  'TRAINER',
  'BATCH_MANAGER',
  'PLACEMENT_OFFICER',
  'MENTOR',
  'COLLEGE_ADMIN',
];

export default function AdminPage() {
  const { user } = useAuth();
  const { org } = useActiveOrg();
  const qc = useQueryClient();
  const [rolePick, setRolePick] = useState<Record<string, string>>({});

  const canManage = user?.permissions.includes('user:manage');
  const canFlags = user?.permissions.includes('feature-flag:manage');

  const membersQ = useQuery({
    queryKey: ['admin', 'members', org?.id],
    queryFn: () => adminApi.members(org!.id),
    enabled: Boolean(org?.id) && Boolean(user?.permissions.includes('user:view')),
  });

  const flagsQ = useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: () => adminApi.flags(),
    enabled: Boolean(canFlags),
  });

  const grant = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminApi.grantRole(org!.id, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'members', org?.id] }),
  });

  const revoke = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      adminApi.revokeRole(org!.id, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'members', org?.id] }),
  });

  const toggleFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      adminApi.setFlag(key, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'flags'] }),
  });

  if (!org) return <Spinner />;
  if (!user?.permissions.includes('user:view') && !canFlags) {
    return <Alert tone="error">You do not have admin access.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">College admin</span></h1>
        <p className="mt-1 text-faint">{org.name} — members, roles, and feature flags.</p>
      </div>

      {user?.permissions.includes('user:view') && (
        <Card>
          <h2 className="mb-3 font-bold">Members</h2>
          {membersQ.isLoading ? (
            <Spinner />
          ) : (
            <ul className="flex flex-col gap-3">
              {(membersQ.data?.data ?? []).map((m) => (
                <li key={m.id} className="rounded-panel border border-hair p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {m.user.profile
                          ? `${m.user.profile.firstName} ${m.user.profile.lastName}`
                          : m.user.email}
                      </div>
                      <div className="text-xs text-faint">{m.user.email}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.user.roles.map((r) => (
                          <Badge key={r} tone="neutral">
                            {r}
                            {canManage && r !== 'SUPER_ADMIN' && (
                              <button
                                type="button"
                                className="ml-1 text-xs opacity-60 hover:opacity-100"
                                onClick={() => revoke.mutate({ userId: m.user.id, role: r })}
                              >
                                ×
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-panel border border-hair bg-panel px-2 py-1 text-sm"
                          value={rolePick[m.user.id] ?? 'STUDENT'}
                          onChange={(e) =>
                            setRolePick({ ...rolePick, [m.user.id]: e.target.value })
                          }
                        >
                          {GRANTABLE.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          onClick={() =>
                            grant.mutate({
                              userId: m.user.id,
                              role: rolePick[m.user.id] ?? 'STUDENT',
                            })
                          }
                        >
                          Grant
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {canFlags && (
        <Card>
          <h2 className="mb-3 font-bold">Feature flags</h2>
          {flagsQ.isLoading ? (
            <Spinner />
          ) : (
            <ul className="flex flex-col gap-2">
              {(flagsQ.data ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="font-semibold">{f.key}</div>
                    {f.description && <div className="text-xs text-faint">{f.description}</div>}
                  </div>
                  <Button
                    size="sm"
                    variant={f.enabled ? 'secondary' : 'primary'}
                    onClick={() => toggleFlag.mutate({ key: f.key, enabled: !f.enabled })}
                  >
                    {f.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
