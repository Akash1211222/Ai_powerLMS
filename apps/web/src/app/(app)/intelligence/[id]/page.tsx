'use client';

import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner, Alert } from '@fca/ui';
import { useActiveOrg } from '@/lib/use-active-org';
import { intelligenceApi } from '@/lib/intelligence-api';
import { IntelligenceReport } from '@/components/intelligence-report';

export default function StudentIntelligencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { org } = useActiveOrg();

  const reportQ = useQuery({
    queryKey: ['intelligence', 'student', org?.id, id],
    queryFn: () => intelligenceApi.student(org!.id, id),
    enabled: Boolean(org?.id),
  });

  if (!org || reportQ.isLoading) return <Spinner />;
  if (reportQ.isError) {
    return <Alert tone="error">Could not load this student&apos;s report.</Alert>;
  }
  const report = reportQ.data!;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/intelligence" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Back to cohort
        </Link>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
          {report.student.firstName} {report.student.lastName}
        </h1>
        <p className="mt-1 text-faint">
          {report.student.email}
          {report.batches.length > 0 && <> · {report.batches.map((b) => b.name).join(', ')}</>}
        </p>
      </div>
      <IntelligenceReport report={report} />
    </div>
  );
}
