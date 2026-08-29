'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner, Alert, Field, Input, Select } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { adminApi } from '@/lib/lms-learning-api';
import { coursesApi, batchesApi } from '@/lib/lms-api';

const GRANTABLE = [
  'STUDENT',
  'TRAINER',
  'BATCH_MANAGER',
  'PLACEMENT_OFFICER',
  'MENTOR',
  'COLLEGE_ADMIN',
];

export default function AdminPage() {
  const { user, viewAs } = useAuth();
  const router = useRouter();
  const { org } = useActiveOrg();
  const qc = useQueryClient();
  const [rolePick, setRolePick] = useState<Record<string, string>>({});
  const emptyMember = { firstName: '', lastName: '', email: '', role: 'STUDENT' };
  const [newMember, setNewMember] = useState(emptyMember);
  // What the account can reach on day one. Only meaningful for a learner, so
  // the section hides for staff roles rather than offering a choice that does
  // nothing.
  // The password from a reset, shown once — same as account creation.
  const [resetFor, setResetFor] = useState<{ email: string; password: string } | null>(null);
  const [recordedCourseIds, setRecordedCourseIds] = useState<string[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const grantsAccess = newMember.role === 'STUDENT';
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  // Issued credentials, surfaced once — the password is never retrievable
  // afterwards, so it stays on screen until another member is added.
  const [created, setCreated] = useState<{
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    recordedCourseIds?: string[];
    batchIds?: string[];
    password: string;
  } | null>(null);

  const canManage = user?.permissions.includes('user:manage');
  const canFlags = user?.permissions.includes('feature-flag:manage');

  const membersQ = useQuery({
    queryKey: ['admin', 'members', org?.id],
    queryFn: () => adminApi.members(org!.id),
    enabled: Boolean(org?.id) && Boolean(user?.permissions.includes('user:view')),
  });

  // Only fetched while the form can actually use them.
  const coursesQ = useQuery({
    queryKey: ['admin', 'courses', org?.id],
    queryFn: () => coursesApi.list(org!.id),
    enabled: Boolean(org?.id) && Boolean(canManage),
  });
  const batchesQ = useQuery({
    queryKey: ['admin', 'batches', org?.id],
    queryFn: () => batchesApi.list(org!.id),
    enabled: Boolean(org?.id) && Boolean(canManage),
  });

  const flagsQ = useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: () => adminApi.flags(),
    enabled: Boolean(canFlags),
  });

  /**
   * A member who cannot sign in. Nobody can be shown their current password —
   * only a hash is stored — so this issues a new one, shown once.
   */
  const resetPassword = useMutation({
    mutationFn: (userId: string) => adminApi.resetMemberPassword(userId),
    onSuccess: (res) => setResetFor(res),
  });

  /** Borrow an account to see the screen the member is describing. */
  const viewAsMember = useMutation({
    mutationFn: (userId: string) => adminApi.viewAsMember(userId),
    onSuccess: async (res) => {
      const who =
        [res.viewing.firstName, res.viewing.lastName].filter(Boolean).join(' ') ||
        res.viewing.email;
      await viewAs(res.accessToken, who);
      router.push('/dashboard');
    },
  });

  const createMember = useMutation({
    mutationFn: (input: typeof emptyMember) =>
      adminApi.createMember({
        organizationId: org!.id,
        ...input,
        // Sent only for a learner: staff accounts have no course access.
        ...(input.role === 'STUDENT' ? { recordedCourseIds, batchIds } : {}),
      }),
    onSuccess: (res) => {
      setCreated(res);
      setNewMember(emptyMember);
      setRecordedCourseIds([]);
      setBatchIds([]);
      qc.invalidateQueries({ queryKey: ['admin', 'members', org?.id] });
    },
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
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          <span className="gradient-text">College admin</span>
        </h1>
        <p className="mt-1 text-faint">{org.name} — members, roles, and feature flags.</p>
      </div>

      {canManage && (
        <Card>
          <h2 className="mb-1 font-bold">Add a member</h2>
          <p className="mb-3 text-sm text-faint">
            There is no public sign-up. Create the account here, then pass the login details on —
            the password is shown once and cannot be retrieved later.
          </p>

          {created && (
            <Alert tone="success">
              <div className="font-semibold">
                {created.firstName} {created.lastName} added as {created.role}
                {created.recordedCourseIds?.length || created.batchIds?.length ? (
                  <span className="ml-1 font-normal">
                    {' '}
                    with {created.recordedCourseIds?.length ?? 0} recorded course
                    {(created.recordedCourseIds?.length ?? 0) === 1 ? '' : 's'} and{' '}
                    {created.batchIds?.length ?? 0} live batch
                    {(created.batchIds?.length ?? 0) === 1 ? '' : 'es'}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 grid gap-1 text-sm">
                <div>
                  Email: <code className="font-mono">{created.email}</code>
                </div>
                <div>
                  Password: <code className="font-mono">{created.password}</code>
                </div>
              </div>
              <div className="mt-2 text-xs opacity-80">
                Share these over a private channel. The member can change the password from “Forgot
                password”.
              </div>
            </Alert>
          )}
          {createMember.isError && (
            <Alert tone="error">
              {createMember.error instanceof Error
                ? createMember.error.message
                : 'Could not create that member.'}
            </Alert>
          )}

          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createMember.mutate(newMember);
            }}
          >
            <Field label="First name">
              {({ id }) => (
                <Input
                  id={id}
                  required
                  value={newMember.firstName}
                  onChange={(e) => setNewMember({ ...newMember, firstName: e.target.value })}
                />
              )}
            </Field>
            <Field label="Last name">
              {({ id }) => (
                <Input
                  id={id}
                  required
                  value={newMember.lastName}
                  onChange={(e) => setNewMember({ ...newMember, lastName: e.target.value })}
                />
              )}
            </Field>
            <Field label="Email">
              {({ id }) => (
                <Input
                  id={id}
                  type="email"
                  required
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                />
              )}
            </Field>
            <Field label="Role">
              {({ id }) => (
                <Select
                  id={id}
                  value={newMember.role}
                  onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                >
                  {GRANTABLE.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {grantsAccess && (
              <div className="sm:col-span-2 rounded-panel border border-hair bg-soft p-4">
                <p className="text-sm font-semibold">Course access</p>
                <p className="mt-0.5 text-xs text-faint">
                  What this student can open on day one. A live seat already includes that
                  course&rsquo;s material, so there is no need to tick both for the same course.
                </p>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <fieldset className="min-w-0">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-faint">
                      Recorded courses
                    </legend>
                    <div className="mt-2 max-h-44 overflow-y-auto pr-1">
                      {coursesQ.isLoading && <Spinner />}
                      {coursesQ.data?.data.length === 0 && (
                        <p className="text-xs text-faint">No courses yet.</p>
                      )}
                      {coursesQ.data?.data.map((c) => (
                        <label key={c.id} className="flex items-start gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={recordedCourseIds.includes(c.id)}
                            onChange={() => setRecordedCourseIds((v) => toggle(v, c.id))}
                          />
                          <span className="min-w-0 truncate">{c.title}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="min-w-0">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-faint">
                      Live batches
                    </legend>
                    <div className="mt-2 max-h-44 overflow-y-auto pr-1">
                      {batchesQ.isLoading && <Spinner />}
                      {batchesQ.data?.data.length === 0 && (
                        <p className="text-xs text-faint">No batches yet.</p>
                      )}
                      {batchesQ.data?.data.map((b) => (
                        <label key={b.id} className="flex items-start gap-2 py-1 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={batchIds.includes(b.id)}
                            onChange={() => setBatchIds((v) => toggle(v, b.id))}
                          />
                          <span className="min-w-0 truncate">
                            {b.name}
                            <span className="ml-1 text-xs text-faint">{b.code}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" loading={createMember.isPending}>
                Add member
              </Button>
            </div>
          </form>
        </Card>
      )}

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
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={viewAsMember.isPending && viewAsMember.variables === m.user.id}
                          onClick={() => viewAsMember.mutate(m.user.id)}
                        >
                          View as
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={resetPassword.isPending && resetPassword.variables === m.user.id}
                          onClick={() => resetPassword.mutate(m.user.id)}
                        >
                          Reset password
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

      {resetFor && (
        <Card>
          <Alert tone="success">
            <div className="font-semibold">Temporary password issued</div>
            <div className="mt-2 grid gap-1 text-sm">
              <div>
                For: <code className="font-mono">{resetFor.email}</code>
              </div>
              <div>
                Password: <code className="font-mono">{resetFor.password}</code>
              </div>
            </div>
            <p className="mt-2 text-xs">
              Shown once — nothing stores it, and asking again issues a different one. They will be
              asked to replace it when they sign in, and any session they had open has been ended.
            </p>
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={() => setResetFor(null)}>
                Done
              </Button>
            </div>
          </Alert>
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
