'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Field, Input, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { coursesApi } from '@/lib/lms-api';
import { ApiError } from '@/lib/api-client';

export default function CoursesPage() {
  const { user } = useAuth();
  const { org, isLoading: orgLoading } = useActiveOrg();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = user?.permissions.includes('course:create');

  const coursesQuery = useQuery({
    queryKey: ['courses', org?.id],
    queryFn: () => coursesApi.list(org!.id),
    enabled: Boolean(org?.id),
  });

  const createMutation = useMutation({
    mutationFn: () => coursesApi.create({ organizationId: org!.id, title: title.trim() }),
    onSuccess: () => {
      setTitle('');
      setCreating(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ['courses', org?.id] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create course'),
  });

  if (orgLoading) return <Spinner />;

  const courses = coursesQuery.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-faint">{org?.name}</p>
        </div>
        {canCreate && !creating && <Button onClick={() => setCreating(true)}>New course</Button>}
      </div>

      {creating && (
        <Card>
          {error && (
            <Alert tone="error" className="mb-4">
              {error}
            </Alert>
          )}
          <Field label="Course title">
            {({ id }) => (
              <Input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Data Analytics Foundations"
                autoFocus
              />
            )}
          </Field>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={title.trim().length < 2}
            >
              Create
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {coursesQuery.isLoading ? (
        <Spinner />
      ) : courses.length === 0 ? (
        <Card>
          <p className="text-sm text-faint">No courses yet. Create your first course to begin.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <Link key={c.id} href={`/courses/${c.id}`}>
              <Card className="h-full transition hover:border-brand-300">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-bold">{c.title}</h2>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </div>
                {c.summary && <p className="mt-2 text-sm text-faint">{c.summary}</p>}
                <div className="mt-3 flex gap-3 text-xs text-faint">
                  <span>{c._count?.modules ?? 0} modules</span>
                  <span>{c._count?.enrollments ?? 0} enrolled</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
