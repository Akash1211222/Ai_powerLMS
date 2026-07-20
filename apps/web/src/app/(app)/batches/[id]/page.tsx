'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Input, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { batchesApi } from '@/lib/lms-api';
import { ApiError } from '@/lib/api-client';
import { BatchHealthPanel } from '@/components/batch-health-panel';

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
  user: { email: string; profile: { firstName: string; lastName: string } | null };
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canManage = user?.permissions.includes('batch:manage');
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
        <h1 className="text-2xl font-extrabold tracking-tight">{batch.name}</h1>
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

      {canViewAnalytics && <BatchHealthPanel batchId={id} />}

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
        <ul className="mt-4 divide-y divide-hair">
          {students.length === 0 && <li className="py-2 text-sm text-faint">No students yet.</li>}
          {students.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium">
                {s.user.profile
                  ? `${s.user.profile.firstName} ${s.user.profile.lastName}`
                  : s.user.email}
              </span>
              <span className="text-faint">{s.user.email}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
