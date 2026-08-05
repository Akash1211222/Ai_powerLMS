'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  TrendingUp,
  CalendarCheck,
  AlarmClock,
  ClipboardList,
  FileCheck2,
  HeartHandshake,
  Briefcase,
  Award,
  ArrowRight,
  Radio,
  Flame,
} from 'lucide-react';
import { Card, Badge, statusTone, Spinner, Alert, cn } from '@fca/ui';
import { dashboardApi, type Deadline } from '@/lib/dashboard-api';
import { formatTime, formatDate } from '@/lib/format';
import { StatTile, ProgressBar } from './stat-tile';
import { BarsChart, DonutChart, AreaTrend } from './charts';
import { DashboardHero, HeroPanel, todayLabel } from './dashboard-hero';

function dueChip(dueAt: string | null): { label: string; cls: string } {
  if (!dueAt) return { label: 'No due date', cls: 'bg-chip text-faint' };
  const days = Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: 'Overdue', cls: 'bg-danger/15 text-danger dark:text-red-300' };
  if (days === 0) return { label: 'Due today', cls: 'bg-accent-100 text-accent-700 dark:bg-accent-500/20 dark:text-orange-300' };
  if (days <= 3) return { label: `${days}d left`, cls: 'bg-warning/15 text-amber-700 dark:text-amber-300' };
  return { label: formatDate(dueAt), cls: 'bg-chip text-faint' };
}

function gradeChipCls(percent: number) {
  if (percent >= 80) return 'bg-success/15 text-emerald-700 dark:text-emerald-300';
  if (percent >= 50) return 'bg-brand-100 text-brand-700 dark:bg-brand-400/15 dark:text-brand-300';
  return 'bg-danger/15 text-danger dark:text-red-300';
}

function DeadlineRow({ d }: { d: Deadline }) {
  const chip = dueChip(d.dueAt);
  const Icon = d.kind === 'ASSIGNMENT' ? ClipboardList : FileCheck2;
  const href = d.kind === 'ASSIGNMENT' ? `/assignments/${d.id}` : `/assessments/${d.id}`;
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-panel bg-chip px-3 py-2 transition hover:bg-soft dark:hover:bg-chip"
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-panel text-white',
            d.kind === 'ASSIGNMENT' ? 'bg-grad-aqua' : 'bg-grad-sunset',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{d.title}</span>
          <span className="block truncate text-xs text-faint">{d.batchName}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', chip.cls)}>
          {chip.label}
        </span>
      </Link>
    </li>
  );
}

export function StudentDashboard({ firstName }: { firstName: string }) {
  const q = useQuery({ queryKey: ['dashboard', 'student'], queryFn: dashboardApi.student });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Could not load your dashboard.</Alert>;
  const d = q.data;

  const completedLessons = d.enrollments.reduce((s, e) => s + (e.progress?.completedLessons ?? 0), 0);
  const totalLessons = d.enrollments.reduce((s, e) => s + (e.progress?.totalLessons ?? 0), 0);
  const progressByCourse = d.enrollments.map((e) => ({
    course: e.course.title.length > 16 ? `${e.course.title.slice(0, 15)}…` : e.course.title,
    Progress: e.progress?.percent ?? 0,
  }));
  const trendData = d.attendanceTrend.map((t) => ({
    day: new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    Present: t.value,
  }));
  const mentor = d.nextMentorSession;
  const mentorName = mentor?.mentor.profile
    ? `${mentor.mentor.profile.firstName} ${mentor.mentor.profile.lastName}`
    : 'Your mentor';

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Student dashboard"
        title="Welcome back,"
        highlight={firstName}
        suffix="👋"
        subtitle={`${todayLabel()} · ${d.stats.attendanceStreak ?? 0}-day streak · ${d.todaySessions.length} session${d.todaySessions.length === 1 ? '' : 's'} today · ${d.stats.pendingDeadlines} due soon`}
        actions={[
          ...(d.nextLiveClass
            ? [{ label: 'Join live class', href: `/live/${d.nextLiveClass.id}`, icon: Radio, primary: true as const }]
            : [{ label: 'Continue learning', href: '/courses', icon: BookOpen, primary: true as const }]),
          { label: 'Assignments', href: '/assignments', icon: ClipboardList },
          { label: 'Take a test', href: '/assessments', icon: FileCheck2 },
          { label: 'Book a mentor', href: '/mentorship', icon: HeartHandshake },
        ]}
      >
        <HeroPanel title="Today's schedule">
          {d.nextLiveClass && (
            <Link
              href={`/live/${d.nextLiveClass.id}`}
              className="mb-3 flex items-center gap-3 rounded-panel bg-accent-500/90 px-3 py-2.5 text-white shadow-lg ring-2 ring-white/30 transition hover:bg-accent-500"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Radio className="h-4 w-4 animate-pulse" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-white/80">
                  Live class · {formatTime(d.nextLiveClass.startsAt)}
                </span>
                <span className="block truncate text-sm font-extrabold">{d.nextLiveClass.title}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
          )}
          {d.todaySessions.length === 0 && !d.nextLiveClass ? (
            <p className="text-sm font-medium text-white/70">
              No sessions today — a great day to catch up on lessons.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.todaySessions.slice(0, 3).map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="rounded-panel bg-white/15 px-2 py-1 text-xs font-bold">
                    {formatTime(s.startsAt)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {s.meetingUrl ? (
                        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent-400 align-middle" aria-hidden />
                      ) : null}
                      {s.title}
                    </span>
                    <span className="block truncate text-xs text-white/60">{s.batch.name}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </HeroPanel>
      </DashboardHero>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Active courses" value={d.stats.activeCourses} icon={BookOpen} accent="violet" />
        <StatTile label="Avg progress" value={`${d.stats.avgProgress}%`} icon={TrendingUp} accent="pink" />
        <StatTile label="Attendance" value={`${d.stats.attendanceRate}%`} icon={CalendarCheck} accent="aqua" />
        <StatTile
          label="Streak"
          value={`${d.stats.attendanceStreak ?? 0}d`}
          sub={`best ${d.stats.longestStreak ?? 0}d`}
          icon={Flame}
          accent="amber"
        />
        <StatTile label="Due soon" value={d.stats.pendingDeadlines} sub="assignments & tests" icon={AlarmClock} accent="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-2 font-display font-bold">Progress by course</h2>
          {progressByCourse.length === 0 ? (
            <p className="text-sm text-faint">No enrollments yet.</p>
          ) : (
            <BarsChart data={progressByCourse} xKey="course" bars={[{ key: 'Progress', color: '#2563eb' }]} yMax={100} height={230} />
          )}
        </Card>
        <Card className="flex flex-col items-center justify-center gap-2">
          <h2 className="self-start font-display font-bold">Lessons</h2>
          <DonutChart
            height={190}
            centerLabel={`${completedLessons}`}
            centerSub={`of ${totalLessons} lessons`}
            data={[
              { name: 'Completed', value: completedLessons, color: '#10b981' },
              { name: 'Remaining', value: Math.max(0, totalLessons - completedLessons), color: '#e7eefb' },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold">Due next</h2>
            <Link href="/assignments" className="text-xs font-bold text-brand-500 hover:underline">
              View all
            </Link>
          </div>
          {d.deadlines.length === 0 ? (
            <p className="text-sm text-faint">You&apos;re all caught up. Nothing pending 🎉</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.deadlines.map((dl) => (
                <DeadlineRow key={`${dl.kind}-${dl.id}`} d={dl} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold">Recent grades</h2>
            <Award className="h-4 w-4 text-accent-500" aria-hidden />
          </div>
          {d.recentGrades.length === 0 ? (
            <p className="text-sm text-faint">Grades appear here once your work is evaluated.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.recentGrades.map((g, i) => (
                <li key={i} className="flex items-center gap-3 rounded-panel bg-chip px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{g.title}</span>
                    <span className="block text-xs text-faint">
                      {g.kind === 'ASSIGNMENT' ? 'Assignment' : 'Test'} · {formatDate(g.at)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold',
                      gradeChipCls(g.percent),
                    )}
                  >
                    {g.percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-display font-bold">Attendance trend</h2>
          <p className="mb-2 text-xs text-faint">Last {trendData.length || 0} sessions</p>
          {trendData.length === 0 ? (
            <p className="text-sm text-faint">No attendance recorded yet.</p>
          ) : (
            <AreaTrend data={trendData} xKey="day" yKey="Present" color="#0ea5e9" height={170} yMax={100} />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 font-display font-bold">My courses</h2>
          {d.enrollments.length === 0 ? (
            <Card>
              <p className="text-sm text-faint">
                You&apos;re not enrolled in any course yet. Once a batch manager adds you, it shows
                up here.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {d.enrollments.map((e) => (
                <Card key={e.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold">{e.course.title}</div>
                      {e.batch && <div className="text-xs text-faint">{e.batch.name}</div>}
                    </div>
                    <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <ProgressBar percent={e.progress?.percent ?? 0} />
                    <span className="w-10 text-right text-sm font-semibold">
                      {e.progress?.percent ?? 0}%
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-faint">
                    {e.progress?.completedLessons ?? 0} / {e.progress?.totalLessons ?? 0} lessons
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-3 font-display font-bold">Mentorship</h2>
            <Card>
              {mentor ? (
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-grad-mint text-white">
                    <HeartHandshake className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{mentor.topic}</div>
                    <div className="text-xs text-faint">
                      with {mentorName} · {formatDate(mentor.scheduledAt)},{' '}
                      {formatTime(mentor.scheduledAt)}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone={mentor.status === 'CONFIRMED' ? 'success' : 'warning'}>
                        {mentor.status}
                      </Badge>
                      {mentor.meetingUrl && (
                        <a
                          href={mentor.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-brand-500 hover:underline"
                        >
                          Join meeting
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-faint">No session booked.</p>
                  <Link
                    href="/mentorship"
                    className="inline-flex items-center gap-1 text-sm font-bold text-brand-500 hover:underline"
                  >
                    Find a mentor <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              )}
            </Card>
          </div>

          <div>
            <h2 className="mb-3 font-display font-bold">Placements</h2>
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-panel bg-chip p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-faint">
                    <Briefcase className="h-3.5 w-3.5 text-brand-500" aria-hidden /> Open jobs
                  </div>
                  <div className="mt-1 font-display text-xl font-extrabold">{d.stats.openJobs}</div>
                </div>
                <div className="rounded-panel bg-chip p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-faint">
                    <FileCheck2 className="h-3.5 w-3.5 text-accent-500" aria-hidden /> My applications
                  </div>
                  <div className="mt-1 font-display text-xl font-extrabold">
                    {d.stats.myApplications}
                  </div>
                </div>
              </div>
              <Link
                href="/placements"
                className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-500 hover:underline"
              >
                Browse job board <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Card>
          </div>

          <div>
            <h2 className="mb-3 font-display font-bold">Upcoming</h2>
            <Card>
              {d.upcomingSessions.length === 0 ? (
                <p className="text-sm text-faint">No sessions scheduled.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {d.upcomingSessions.slice(0, 5).map((s) => (
                    <li key={s.id} className="rounded-panel border-l-4 border-brand-400 bg-chip py-1.5 pl-3 pr-2">
                      <div className="text-sm font-semibold">{s.title}</div>
                      <div className="text-xs text-faint">
                        {formatDate(s.startsAt)} · {formatTime(s.startsAt)}
                      </div>
                      <div className="text-xs text-faint">{s.batch.name}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
