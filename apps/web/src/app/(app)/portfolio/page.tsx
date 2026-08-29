'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, Layers, Briefcase, CalendarCheck } from 'lucide-react';
import { Card, Spinner, Alert, Badge } from '@fca/ui';
import { portfolioApi, type PortfolioRow } from '@/lib/lms-api';
import { useActiveOrg } from '@/lib/use-active-org';

/**
 * Every college a person is responsible for, side by side.
 *
 * For most people this is one row and says little they did not know. It exists
 * for an operations lead, whose colleges are otherwise only visible one at a
 * time through the switcher — and "which of my five needs me today" is not a
 * question you can answer by visiting five dashboards.
 *
 * The rows come from their memberships, so this widens to a portfolio without
 * ever widening to "all organisations".
 */
export default function PortfolioPage() {
  const { setOrg, org: activeOrg } = useActiveOrg();
  const query = useQuery({ queryKey: ['me', 'portfolio'], queryFn: portfolioApi.mine });

  if (query.isLoading) return <Spinner />;
  if (query.error) {
    return <Alert tone="error">Could not load your colleges. Try again in a moment.</Alert>;
  }

  const rows = query.data ?? [];
  const totals = rows.reduce(
    (a, r) => ({
      students: a.students + r.students,
      activeBatches: a.activeBatches + r.activeBatches,
      pending: a.pending + r.pendingApplications,
    }),
    { students: 0, activeBatches: 0, pending: 0 },
  );

  /** Anything a lead would want to look at today. */
  const needsAttention = (r: PortfolioRow) =>
    (r.attendanceRate !== null && r.attendanceRate < 75) || r.pendingApplications > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Your colleges</h1>
        <p className="mt-1 text-faint">
          {rows.length === 1
            ? 'The organisation you belong to.'
            : `${rows.length} organisations · ${totals.students} students · ${totals.activeBatches} batches running`}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => {
          const name = r.organization.displayName || r.organization.name;
          const isActive = r.organization.id === activeOrg?.id;
          return (
            <Card key={r.organization.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                    <h2 className="truncate font-bold">{name}</h2>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {r.organization.type === 'INTERNAL' && (
                      <Badge tone="brand">Our own academy</Badge>
                    )}
                    {isActive && <Badge tone="success">Currently viewing</Badge>}
                    {needsAttention(r) && <Badge tone="warning">Needs a look</Badge>}
                  </div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Stat icon={<Users className="h-4 w-4" />} label="Students" value={r.students} />
                <Stat
                  icon={<Layers className="h-4 w-4" />}
                  label="Batches running"
                  value={`${r.activeBatches} of ${r.batches}`}
                />
                <Stat
                  icon={<CalendarCheck className="h-4 w-4" />}
                  label="Attendance"
                  // Nothing recorded is not the same as nobody turning up.
                  value={r.attendanceRate === null ? 'No sessions yet' : `${r.attendanceRate}%`}
                />
                <Stat
                  icon={<Briefcase className="h-4 w-4" />}
                  label="Open roles"
                  value={
                    r.pendingApplications > 0
                      ? `${r.openRoles} · ${r.pendingApplications} to review`
                      : String(r.openRoles)
                  }
                />
              </dl>

              <div className="mt-4 flex items-center gap-3 text-sm">
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => setOrg(r.organization.id)}
                    className="font-semibold text-link underline underline-offset-2"
                  >
                    Switch to this college
                  </button>
                )}
                <Link
                  href="/batches"
                  className="font-semibold text-link underline underline-offset-2"
                >
                  Batches →
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-faint">
        <span className="opacity-70">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}
