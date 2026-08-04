'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Field, Input, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { coursesApi } from '@/lib/lms-api';
import { ApiError } from '@/lib/api-client';

/** Cover gradients cycled across course cards. */
const COVER_GRADIENTS = ['bg-grad-brand', 'bg-grad-aqua', 'bg-grad-sunset', 'bg-grad-mint', 'bg-grad-holo'];

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
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            <span className="gradient-text">Courses</span>
          </h1>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => {
            const cover = COVER_GRADIENTS[i % COVER_GRADIENTS.length]!;
            return (
              <Link key={c.id} href={`/courses/${c.id}`} className="group">
                <Card className="h-full overflow-hidden p-0 transition-transform duration-300 group-hover:-translate-y-1">
                  <div
                    className={`relative flex h-28 items-end justify-between p-4 ${cover} bg-[length:150%_150%] bg-left transition-all duration-500 group-hover:bg-right`}
                  >
                    <span className="font-display text-4xl font-extrabold text-white/30">
                      {c.title
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')}
                    </span>
                    <Badge tone={statusTone(c.status)} className="bg-white/90 backdrop-blur">
                      {c.status}
                    </Badge>
                  </div>
                  <div className="p-4">
                    <h2 className="font-display font-bold leading-snug">{c.title}</h2>
                    {c.summary && <p className="mt-1.5 line-clamp-2 text-sm text-faint">{c.summary}</p>}
                    <div className="mt-3 flex gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-chip px-2.5 py-1 text-brand-600">
                        {c._count?.modules ?? 0} modules
                      </span>
                      <span className="rounded-full bg-aqua-50 px-2.5 py-1 text-aqua-700">
                        {c._count?.enrollments ?? 0} enrolled
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
