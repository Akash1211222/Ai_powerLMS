'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Input, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { batchesApi } from '@/lib/lms-api';
import { adminApi } from '@/lib/lms-learning-api';
import { ApiError } from '@/lib/api-client';
import { BatchHealthPanel } from '@/components/batch-health-panel';
import { BatchPlacementPanel } from '@/components/batch-placement-panel';
import { LiveClassPanel } from '@/components/live-class-panel';

interface BatchDetail {
  id: string;
  name: string;
  code: string;
  status: string;
  capacity: number | null;
  course: { id: string; title: string; status: string };
  trainers: Array<{ user: { profile: { firstName: string; lastName: string } | null } }>;
  _count: { students: number };
}
interface StudentRow {
  id: string;
  user: { id: string; email: string; profile: { firstName: string; lastName: string } | null };
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The password from a reset, shown once. Nothing stores it.
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const router = useRouter();
  const { viewAs } = useAuth();

  /**
   * The two things the batch desk is actually asked for when a student cannot
   * get in. They live here rather than under Admin because a batch manager
   * cannot open Admin at all — this roster is where they already are.
   */
  const canSupport = user?.permissions.includes('student:view');

  const resetPassword = useMutation({
    mutationFn: (userId: string) => adminApi.resetMemberPassword(userId),
    onSuccess: (res) => setIssued(res),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not reset the password'),
  });

  const viewAsStudent = useMutation({
    mutationFn: (userId: string) => adminApi.viewAsMember(userId),
    onSuccess: async (res) => {
      const who =
        [res.viewing.firstName, res.viewing.lastName].filter(Boolean).join(' ') ||
        res.viewing.email;
      await viewAs(res.accessToken, who);
      router.push('/dashboard');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not open that account'),
  });

  const canManage = user?.permissions.includes('batch:manage');
  const canScheduleLive =
    Boolean(canManage) ||
    user?.permissions.includes('course:update') ||
    user?.permissions.includes('attendance:mark');
  const canViewAnalytics = user?.permissions.includes('analytics:view');

  const batchQuery = useQuery({
    queryKey: ['batch', id],
    queryFn: () => batchesApi.get(id) as Promise<BatchDetail>,
  });
  const studentsQuery = useQuery({
    queryKey: ['batch', id, 'students'],
    queryFn: () => batchesApi.students(id) as Promise<StudentRow[]>,
  });

  const addStudent = useMutation({
    mutationFn: () => batchesApi.addStudent(id, email.trim()),
    onSuccess: () => {
      setEmail('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['batch', id] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to add student'),
  });

  if (batchQuery.isLoading) return <Spinner />;
  const batch = batchQuery.data;
  if (!batch) return <Alert tone="error">Batch not found.</Alert>;
  const students = studentsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/batches" className="text-sm font-semibold text-brand-500">
        ← Batches
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{batch.name}</h1>
        <Badge tone={statusTone(batch.status)}>{batch.status}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm font-semibold text-faint">Course</div>
          <div className="mt-1 font-medium">{batch.course.title}</div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-faint">Code</div>
          <div className="mt-1 font-mono">{batch.code}</div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-faint">Students</div>
          <div className="mt-1 font-medium">
            {batch._count.students}
            {batch.capacity ? ` / ${batch.capacity}` : ''}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/assignments?batchId=${id}`}
          className="rounded-panel border border-hair px-3 py-1.5 text-sm font-semibold hover:bg-soft"
        >
          Assignments
        </Link>
        <Link
          href={`/assessments?batchId=${id}`}
          className="rounded-panel border border-hair px-3 py-1.5 text-sm font-semibold hover:bg-soft"
        >
          Assessments
        </Link>
        <Link
          href={`/attendance?batchId=${id}`}
          className="rounded-panel border border-hair px-3 py-1.5 text-sm font-semibold hover:bg-soft"
        >
          Attendance
        </Link>
      </div>

      <LiveClassPanel batchId={id} canSchedule={Boolean(canScheduleLive)} />

      {canViewAnalytics && <BatchHealthPanel batchId={id} />}
      {canViewAnalytics && <BatchPlacementPanel batchId={id} />}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Students</h2>
        </div>
        {canManage && (
          <div className="mt-3">
            {error && (
              <Alert tone="error" className="mb-3">
                {error}
              </Alert>
            )}
            <div className="flex items-end gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@email.com"
              />
              <Button
                onClick={() => addStudent.mutate()}
                loading={addStudent.isPending}
                disabled={!email.includes('@')}
              >
                Add student
              </Button>
            </div>
          </div>
        )}
        {issued && (
          <Alert tone="success" className="mt-4">
            <div className="font-semibold">Temporary password issued</div>
            <div className="mt-2 grid gap-1 text-sm">
              <div>
                For: <code className="font-mono">{issued.email}</code>
              </div>
              <div>
                Password: <code className="font-mono">{issued.password}</code>
              </div>
            </div>
            <p className="mt-2 text-xs">
              Read it out once. Nothing stores it, asking again issues a different one, and they
              will be asked to replace it when they sign in.
            </p>
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={() => setIssued(null)}>
                Done
              </Button>
            </div>
          </Alert>
        )}

        <ul className="mt-4 divide-y divide-hair">
          {students.length === 0 && <li className="py-2 text-sm text-faint">No students yet.</li>}
          {students.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">
                  {s.user.profile
                    ? `${s.user.profile.firstName} ${s.user.profile.lastName}`
                    : s.user.email}
                </span>
                <span className="ml-2 text-faint">{s.user.email}</span>
              </span>
              {canSupport && (
                <span className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={viewAsStudent.isPending && viewAsStudent.variables === s.user.id}
                    onClick={() => viewAsStudent.mutate(s.user.id)}
                  >
                    View as
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={resetPassword.isPending && resetPassword.variables === s.user.id}
                    onClick={() => resetPassword.mutate(s.user.id)}
                  >
                    Reset password
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
