'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Field, Input, Select, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { batchesApi, coursesApi } from '@/lib/lms-api';
import { ApiError } from '@/lib/api-client';

export default function BatchesPage() {
  const { user } = useAuth();
  const { org, isLoading: orgLoading } = useActiveOrg();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canCreate = user?.permissions.includes('batch:create');

  const batchesQuery = useQuery({
    queryKey: ['batches', org?.id],
    queryFn: () => batchesApi.list(org!.id),
    enabled: Boolean(org?.id),
  });
  const coursesQuery = useQuery({
    queryKey: ['courses', org?.id],
    queryFn: () => coursesApi.list(org!.id),
    enabled: Boolean(org?.id) && creating,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      batchesApi.create({ organizationId: org!.id, courseId, name: name.trim() }),
    onSuccess: () => {
      setName('');
      setCourseId('');
      setCreating(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ['batches', org?.id] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create batch'),
  });

  if (orgLoading) return <Spinner />;
  const batches = batchesQuery.data?.data ?? [];
  const courses = coursesQuery.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Batches</h1>
          <p className="mt-1 text-sm text-faint">{org?.name}</p>
        </div>
        {canCreate && !creating && <Button onClick={() => setCreating(true)}>New batch</Button>}
      </div>

      {creating && (
        <Card>
          {error && (
            <Alert tone="error" className="mb-4">
              {error}
            </Alert>
          )}
          <div className="flex flex-col gap-4">
            <Field label="Batch name">
              {({ id }) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Data Analytics — Aug 2026"
                  autoFocus
                />
              )}
            </Field>
            <Field label="Course">
              {({ id }) => (
                <Select id={id} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">Select a course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
                disabled={name.trim().length < 2 || !courseId}
              >
                Create
              </Button>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {batchesQuery.isLoading ? (
        <Spinner />
      ) : batches.length === 0 ? (
        <Card>
          <p className="text-sm text-faint">No batches yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {batches.map((b) => (
            <Link key={b.id} href={`/batches/${b.id}`}>
              <Card className="h-full transition hover:border-brand-300">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-bold">{b.name}</h2>
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-faint">{b.course.title}</p>
                <div className="mt-3 flex gap-3 text-xs text-faint">
                  <span className="font-mono">{b.code}</span>
                  <span>{b._count?.students ?? 0} students</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
