'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Layers3, Plus, Sparkles, Users } from 'lucide-react';
import { Card, Button, Field, Input, Badge, statusTone, Spinner, Alert, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import { coursesApi } from '@/lib/lms-api';
import { ApiError } from '@/lib/api-client';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';

const COVER_GRADIENTS = ['bg-grad-brand', 'bg-grad-aqua', 'bg-grad-sunset', 'bg-grad-mint', 'bg-grad-holo'];

type Filter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

export default function CoursesPage() {
  const { user } = useAuth();
  const { org, isLoading: orgLoading } = useActiveOrg();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

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

  const courses = coursesQuery.data?.data ?? [];
  const filtered = useMemo(
    () => (filter === 'ALL' ? courses : courses.filter((c) => c.status === filter)),
    [courses, filter],
  );

  const stats = useMemo(
    () => ({
      total: courses.length,
      published: courses.filter((c) => c.status === 'PUBLISHED').length,
      modules: courses.reduce((n, c) => n + (c._count?.modules ?? 0), 0),
      enrolled: courses.reduce((n, c) => n + (c._count?.enrollments ?? 0), 0),
    }),
    [courses],
  );

  if (orgLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Learning deck"
        title="Courses"
        highlight="command bay"
        subtitle={`${todayLabel()} · ${org?.name ?? 'Academy'} · learn in-app with tracked progress`}
        actions={[
          { label: 'Live classes', href: '/live', icon: Sparkles },
          { label: 'Assignments', href: '/assignments', icon: BookOpen },
        ]}
      >
        <HeroPanel title="Catalog pulse">
          <div className="font-display text-3xl font-extrabold">{stats.published}</div>
          <div className="text-xs text-white/60">published courses ready to fly</div>
        </HeroPanel>
      </DashboardHero>

      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/courses-hub-hero.png"
          alt="Fox studying holographic course lessons"
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/92 via-[#0b1b3a]/45 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">In-app learning</p>
          <p className="font-display text-xl font-extrabold sm:text-2xl">
            Watch & read without leaving the cockpit.
          </p>
          <p className="mt-1 text-sm text-white/75">
            Video watch time and reading dwell time are tracked lesson by lesson.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="Courses" value={stats.total} accent="bg-grad-holo" icon={BookOpen} />
        <StatChip label="Published" value={stats.published} accent="bg-grad-mint" icon={Sparkles} />
        <StatChip label="Modules" value={stats.modules} accent="bg-grad-aqua" icon={Layers3} />
        <StatChip label="Enrolled" value={stats.enrolled} accent="bg-grad-sunset" icon={Users} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
          {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={cn(
                'cursor-pointer rounded-panel px-3 py-2 text-sm font-bold transition',
                filter === s ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {canCreate && !creating && (
          <Button className="bg-grad-holo text-white shadow-glow" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New course
          </Button>
        )}
      </div>

      {creating && (
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-grad-sunset opacity-20 blur-2xl" />
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
              className="bg-grad-holo text-white shadow-glow"
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
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-faint">No courses in this filter. Create one to begin the deck.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => {
            const cover = COVER_GRADIENTS[i % COVER_GRADIENTS.length]!;
            return (
              <Link key={c.id} href={`/courses/${c.id}`} className="group">
                <Card className="h-full overflow-hidden p-0 transition-transform duration-300 group-hover:-translate-y-1">
                  <div
                    className={`relative flex h-32 items-end justify-between p-4 ${cover} bg-[length:150%_150%] bg-left transition-all duration-500 group-hover:bg-right`}
                  >
                    <span className="font-display text-4xl font-extrabold text-white/30">
                      {c.title
                        .split(' ')
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join('')}
                    </span>
                    <Badge
                      tone={statusTone(c.status)}
                      className="!bg-white/90 !text-[#0f1e3d] backdrop-blur dark:!bg-white/90 dark:!text-[#0f1e3d]"
                    >
                      {c.status}
                    </Badge>
                  </div>
                  <div className="p-4">
                    <h2 className="font-display font-bold leading-snug group-hover:text-brand-600">{c.title}</h2>
                    {c.summary && <p className="mt-1.5 line-clamp-2 text-sm text-faint">{c.summary}</p>}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-chip px-2.5 py-1 text-brand-600">
                        {c._count?.modules ?? 0} modules
                      </span>
                      <span className="rounded-full bg-aqua-50 px-2.5 py-1 text-aqua-700">
                        {c._count?.enrollments ?? 0} enrolled
                      </span>
                      <span className="rounded-full bg-chip px-2.5 py-1 text-faint">{c.level}</span>
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

function StatChip({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number;
  accent: string;
  icon: typeof BookOpen;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute inset-y-0 left-0 w-1', accent)} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">{label}</div>
          <div className="mt-1 font-display text-2xl font-extrabold">{value}</div>
        </div>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-panel text-white', accent)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Card>
  );
}
