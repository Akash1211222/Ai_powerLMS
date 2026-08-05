'use client';

import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Spinner, Alert, Badge } from '@fca/ui';
import { useActiveOrg } from '@/lib/use-active-org';
import { intelligenceApi } from '@/lib/intelligence-api';
import { IntelligenceReport, riskTone, RiskRing } from '@/components/intelligence-report';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';

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
      <Link
        href="/intelligence"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to cohort
      </Link>

      <DashboardHero
        eyebrow="Student dossier"
        title={report.student.firstName}
        highlight={report.student.lastName}
        subtitle={`${todayLabel()} · ${report.student.email}${
          report.batches.length > 0 ? ` · ${report.batches.map((b) => b.name).join(', ')}` : ''
        }`}
        actions={[{ label: 'Open opportunities', href: '/opportunities', icon: Sparkles, primary: true }]}
      >
        <HeroPanel title="Risk pulse">
          <div className="flex items-center gap-3">
            <RiskRing score={report.insight.riskScore} level={report.insight.riskLevel} size={64} />
            <div>
              <Badge tone={riskTone(report.insight.riskLevel)}>{report.insight.riskLevel}</Badge>
              <div className="mt-1 text-xs text-white/60">score {report.insight.riskScore}/100</div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/intelligence-hub-hero.png"
          alt="Owl beside a holographic neural constellation"
          className="h-36 w-full object-cover object-[center_35%] sm:h-44"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/90 via-[#0b1b3a]/40 to-transparent" />
        <div className="absolute bottom-4 left-4 max-w-lg text-white">
          <p className="font-display text-xl font-extrabold">Signal dossier</p>
          <p className="text-sm text-white/75 line-clamp-2">{report.insight.summary}</p>
        </div>
      </div>

      <IntelligenceReport report={report} audience="trainer" />
    </div>
  );
}
