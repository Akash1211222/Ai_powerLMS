'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Field, Input, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { attendanceApi } from '@/lib/lms-learning-api';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

export default function AttendancePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AttendanceInner />
    </Suspense>
  );
}

function AttendanceInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const batchId = params.get('batchId');
  const canMark = user?.permissions.includes('attendance:mark');

  if (canMark && batchId) return <StaffAttendance batchId={batchId} />;
  return <StudentAttendance />;
}

function StaffAttendance({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('Session');
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['attendance', 'sessions', batchId],
    queryFn: () => attendanceApi.listSessions(batchId),
  });

  const create = useMutation({
    mutationFn: () => attendanceApi.createSession(batchId, title.trim() || 'Session'),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['attendance', 'sessions', batchId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (listQ.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/batches/${batchId}`} className="text-sm font-semibold text-brand-500">
          ← Batch
        </Link>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">Attendance</span></h1>
      </div>

      <Card>
        <h2 className="font-bold">New session</h2>
        {error && (
          <Alert tone="error" className="mt-2">
            {error}
          </Alert>
        )}
        <div className="mt-3 flex items-end gap-2">
          <Field label="Title">
            {({ id }) => (
              <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />
            )}
          </Field>
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            Create
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {(listQ.data ?? []).map((s) => (
          <Card key={s.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Link
                  href={`/attendance/${s.id}?batchId=${batchId}`}
                  className="font-bold text-brand-600"
                >
                  {s.title}
                </Link>
                <div className="text-xs text-faint">{formatDate(s.sessionDate)}</div>
              </div>
              <Badge tone={statusTone(s.status)}>{s.status}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StudentAttendance() {
  const [reason, setReason] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const qc = useQueryClient();

  const mineQ = useQuery({
    queryKey: ['attendance', 'me'],
    queryFn: () => attendanceApi.mine(),
  });

  const correct = useMutation({
    mutationFn: () =>
      attendanceApi.requestCorrection(recordId!, 'PRESENT', reason.trim() || 'I was present'),
    onSuccess: () => {
      setRecordId(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['attendance', 'me'] });
    },
  });

  if (mineQ.isLoading) return <Spinner />;
  const d = mineQ.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">My attendance</span></h1>
        <p className="mt-1 text-faint">
          Rate: {d?.summary.rate ?? 0}% ({d?.summary.present ?? 0}/{d?.summary.total ?? 0})
        </p>
      </div>
      <Card>
        {(d?.records ?? []).length === 0 ? (
          <p className="text-sm text-faint">No attendance records yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(d?.records ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{r.session.title}</div>
                  <div className="text-xs text-faint">{formatDate(r.session.sessionDate)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  {r.status === 'ABSENT' && (
                    <Button size="sm" variant="secondary" onClick={() => setRecordId(r.id)}>
                      Request correction
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {recordId && (
        <Card>
          <h2 className="font-bold">Correction request</h2>
          <textarea
            className="mt-3 min-h-24 w-full rounded-panel border border-hair bg-panel p-3 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why should this be marked present?"
          />
          <div className="mt-3 flex gap-2">
            <Button onClick={() => correct.mutate()} loading={correct.isPending}>
              Submit
            </Button>
            <Button variant="secondary" onClick={() => setRecordId(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
