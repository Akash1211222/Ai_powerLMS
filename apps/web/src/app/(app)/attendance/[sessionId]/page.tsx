'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { attendanceApi } from '@/lib/lms-learning-api';
import { batchesApi } from '@/lib/lms-api';
import { formatDate } from '@/lib/format';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export default function AttendanceSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const search = useSearchParams();
  const batchId = search.get('batchId');
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, Status>>({});

  const sessionQ = useQuery({
    queryKey: ['attendance', 'session', sessionId],
    queryFn: () => attendanceApi.getSession(sessionId),
  });

  const studentsQ = useQuery({
    queryKey: ['batch', batchId, 'students'],
    queryFn: () => batchesApi.students(batchId!) as Promise<
      Array<{ user: { id: string; email: string; profile: { firstName: string; lastName: string } | null } }>
    >,
    enabled: Boolean(batchId),
  });

  useEffect(() => {
    if (!sessionQ.data) return;
    const next: Record<string, Status> = {};
    for (const r of sessionQ.data.records) {
      next[r.studentId] = r.status;
    }
    // Pre-fill unmarked students as ABSENT so trainer can flip to PRESENT.
    for (const s of studentsQ.data ?? []) {
      if (!next[s.user.id]) next[s.user.id] = 'ABSENT';
    }
    setMarks(next);
  }, [sessionQ.data, studentsQ.data]);

  const mark = useMutation({
    mutationFn: () =>
      attendanceApi.mark(
        sessionId,
        Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance', 'session', sessionId] }),
  });

  if (sessionQ.isLoading) return <Spinner />;
  const session = sessionQ.data;
  if (!session) return <Alert tone="error">Session not found.</Alert>;

  const students = studentsQ.data ?? [];
  const rows =
    students.length > 0
      ? students.map((s) => ({
          id: s.user.id,
          email: s.user.email,
          name: s.user.profile
            ? `${s.user.profile.firstName} ${s.user.profile.lastName}`
            : s.user.email,
        }))
      : session.records.map((r) => ({
          id: r.studentId,
          email: r.student.email,
          name: r.student.profile
            ? `${r.student.profile.firstName} ${r.student.profile.lastName}`
            : r.student.email,
        }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={batchId ? `/attendance?batchId=${batchId}` : '/attendance'}
        className="text-sm font-semibold text-brand-500"
      >
        ← Attendance
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{session.title}</h1>
        <Badge tone={statusTone(session.status)}>{session.status}</Badge>
      </div>
      <p className="text-sm text-faint">{formatDate(session.sessionDate)}</p>

      <Card>
        <h2 className="mb-3 font-bold">Mark attendance</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-faint">No students in this batch.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-hair py-2 last:border-0"
              >
                <div>
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-faint">{r.email}</div>
                </div>
                <select
                  className="rounded-panel border border-hair bg-panel px-2 py-1 text-sm"
                  value={marks[r.id] ?? 'ABSENT'}
                  onChange={(e) =>
                    setMarks({ ...marks, [r.id]: e.target.value as Status })
                  }
                >
                  {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as Status[]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Button onClick={() => mark.mutate()} loading={mark.isPending} disabled={rows.length === 0}>
            Save marks
          </Button>
        </div>
      </Card>
    </div>
  );
}
