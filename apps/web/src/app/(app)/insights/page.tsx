'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Spinner, Alert } from '@fca/ui';
import { useActiveOrg } from '@/lib/use-active-org';
import { analyticsApi } from '@/lib/analytics-api';

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-panel border border-hair bg-soft px-3 py-2.5">
      <div className="text-xl font-extrabold tracking-tight">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="text-xs text-faint">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{children}</div>
    </Card>
  );
}

/**
 * Organization-wide network insights (§33). Every figure is a plain count or
 * ratio computed by the platform — nothing here is inferred or predicted.
 */
export default function InsightsPage() {
  const { org, isLoading: orgLoading } = useActiveOrg();
  const q = useQuery({
    queryKey: ['analytics', 'network', org?.id],
    queryFn: () => analyticsApi.network(org!.id),
    enabled: Boolean(org?.id),
  });

  if (orgLoading || q.isLoading) return <Spinner />;
  if (!org) return <Alert tone="error">No organization found.</Alert>;
  if (q.error || !q.data) return <Alert tone="error">Could not load network insights.</Alert>;
  const i = q.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Network Insights</h1>
        <p className="mt-1 text-sm text-faint">
          How the whole ecosystem is performing — learning, careers and community.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {i.highlights.map((h) => (
          <Card key={h.label} className="bg-gradient-to-br from-brand-500 to-brand-800 text-white">
            <div className="text-2xl font-extrabold">{h.value}</div>
            <div className="text-sm font-semibold">{h.label}</div>
            <div className="mt-1 text-xs text-white/80">{h.detail}</div>
          </Card>
        ))}
      </div>

      <Section title="Learning" subtitle="What's happening inside the programme.">
        <Metric label="Active students" value={i.learning.activeStudents} />
        <Metric label="Active batches" value={i.learning.activeBatches} />
        <Metric label="Attendance" value={`${i.learning.avgAttendance}%`} />
        <Metric label="Avg score" value={i.learning.avgOverallScore} />
        <Metric label="At risk" value={i.learning.atRiskCount} hint="HIGH or CRITICAL" />
      </Section>

      <Section title="Careers" subtitle="Where the programme leads.">
        <Metric label="Open roles" value={i.career.openOpportunities} />
        <Metric label="Applications" value={i.career.applications} hint={`${i.career.applicants} applicant(s)`} />
        <Metric label="Hires" value={i.career.hires} />
        <Metric label="Mentoring" value={i.career.mentoringSessions} hint="sessions completed" />
        <Metric label="Alumni" value={i.career.alumni} />
      </Section>

      <Section title="Community" subtitle="The knowledge and goodwill the network creates.">
        <Metric label="Questions" value={i.community.questions} />
        <Metric label="Answers" value={i.community.answers} />
        <Metric label="Answered" value={`${i.community.answeredRate}%`} />
        <Metric label="Referrals" value={i.community.referrals} />
        <Metric label="Contributors" value={i.community.activeContributors} />
      </Section>
    </div>
  );
}
