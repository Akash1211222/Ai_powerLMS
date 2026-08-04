'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { batchesApi } from '@/lib/lms-api';
import { intelligenceApi } from '@/lib/intelligence-api';
import { IntelligenceReport, riskTone } from '@/components/intelligence-report';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
    </Card>
  );
}

function StaffView({ orgId }: { orgId: string }) {
  const [batchId, setBatchId] = useState('');

  const batchesQ = useQuery({
    queryKey: ['batches', orgId],
    queryFn: () => batchesApi.list(orgId),
  });
  const cohortQ = useQuery({
    queryKey: ['intelligence', 'cohort', orgId, batchId],
    queryFn: () => intelligenceApi.cohort(orgId, batchId || undefined),
  });

  if (cohortQ.isLoading) return <Spinner />;
  if (cohortQ.isError) return <Alert tone="error">Could not load cohort intelligence.</Alert>;
  const data = cohortQ.data!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4">
        <Stat label="Students" value={data.stats.total} />
        <Stat label="High risk" value={data.stats.high} />
        <Stat label="Needs attention" value={data.stats.medium} />
        <Stat label="On track" value={data.stats.low} />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold">Students by risk</h2>
          <select
            className="rounded-panel border border-hair bg-panel px-2 py-1 text-sm"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">All batches</option>
            {(batchesQ.data?.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {data.students.length === 0 ? (
          <p className="text-sm text-faint">No active students found.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.students.map((s) => (
              <li key={s.userId} className="rounded-panel border border-hair p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/intelligence/${s.userId}`}
                      className="font-semibold text-brand-600 hover:underline"
                    >
                      {s.firstName} {s.lastName}
                    </Link>
                    <div className="text-xs text-faint">
                      {s.email} · {s.batches.map((b) => b.name).join(', ')}
                    </div>
                    <p className="mt-1 text-sm">{s.insight.summary}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={riskTone(s.insight.riskLevel)}>
                      {s.insight.riskLevel} · {s.insight.riskScore}/100
                    </Badge>
                    <div className="text-xs text-faint">
                      Att {s.signals.attendanceRate}% · Asg {s.signals.assignmentAvg}% · Test{' '}
                      {s.signals.assessmentAvg}%
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StudentSelfView() {
  const meQ = useQuery({ queryKey: ['intelligence', 'me'], queryFn: intelligenceApi.me });
  if (meQ.isLoading) return <Spinner />;
  if (meQ.isError) return <Alert tone="error">Could not load your report.</Alert>;
  return <IntelligenceReport report={meQ.data!} />;
}

export default function IntelligencePage() {
  const { user } = useAuth();
  const { org } = useActiveOrg();

  const isStaff = Boolean(user?.permissions.includes('student:view'));

  if (!user || (isStaff && !org)) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">Student intelligence</span></h1>
        <p className="mt-1 text-faint">
          {isStaff
            ? 'Explainable risk insights from attendance, assignments, and assessments.'
            : 'Your learning signals and AI-generated guidance.'}
        </p>
      </div>
      {isStaff ? <StaffView orgId={org!.id} /> : <StudentSelfView />}
    </div>
  );
}
