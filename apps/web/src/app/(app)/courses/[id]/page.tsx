'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Link2,
  PlayCircle,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Card, Button, Input, Select, Textarea, Badge, statusTone, Spinner, Alert, cn } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { coursesApi, type Lesson, type LessonProgressRow } from '@/lib/lms-api';
import { liveApi } from '@/lib/live-api';
import { ApiError } from '@/lib/api-client';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';
import { formatDuration, formatWatch } from '@/lib/video-source';

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [moduleTitle, setModuleTitle] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [tab, setTab] = useState<'learn' | 'build'>('learn');

  const canEdit = user?.permissions.includes('course:update');
  const canPublish = user?.permissions.includes('course:publish');

  const courseQuery = useQuery({ queryKey: ['course', id], queryFn: () => coursesApi.get(id) });
  const progressQuery = useQuery({
    queryKey: ['course', id, 'progress'],
    queryFn: () => coursesApi.myProgress(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['course', id] });
    qc.invalidateQueries({ queryKey: ['course', id, 'progress'] });
  };

  const addModule = useMutation({
    mutationFn: () => coursesApi.addModule(id, moduleTitle.trim()),
    onSuccess: () => {
      setModuleTitle('');
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: (next: boolean) => (next ? coursesApi.publish(id) : coursesApi.unpublish(id)),
    onSuccess: () => {
      setBanner(null);
      invalidate();
    },
    onError: (e) => setBanner(e instanceof ApiError ? e.message : 'Action failed'),
  });

  const progressMap = useMemo(() => {
    const map = new Map<string, LessonProgressRow>();
    for (const p of progressQuery.data?.lessons ?? []) map.set(p.lessonId, p);
    return map;
  }, [progressQuery.data]);

  if (courseQuery.isLoading) return <Spinner />;
  const course = courseQuery.data;
  if (!course) return <Alert tone="error">Course not found.</Alert>;

  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const videoCount = course.modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.type === 'VIDEO').length,
    0,
  );
  const readingCount = course.modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.type === 'READING').length,
    0,
  );
  const coursePct = progressQuery.data?.course?.percent ?? 0;
  const firstIncomplete = course.modules
    .flatMap((m) => m.lessons)
    .find((l) => progressMap.get(l.id)?.status !== 'COMPLETED');

  return (
    <div className="flex flex-col gap-6">
      <Link href="/courses" className="text-sm font-semibold text-brand-500">
        ← Courses
      </Link>

      <DashboardHero
        eyebrow="Course cockpit"
        title={course.title}
        highlight={course.status === 'PUBLISHED' ? 'live' : course.status.toLowerCase()}
        subtitle={`${todayLabel()} · ${lessonCount} lessons · in-app video & reading`}
        actions={
          firstIncomplete
            ? [
                {
                  label: 'Continue learning',
                  href: `/courses/${id}/lessons/${firstIncomplete.id}`,
                  icon: PlayCircle,
                  primary: true,
                },
              ]
            : lessonCount > 0
              ? [
                  {
                    label: 'Review course',
                    href: `/courses/${id}/lessons/${course.modules[0]!.lessons[0]!.id}`,
                    icon: BookOpen,
                    primary: true,
                  },
                ]
              : []
        }
      >
        <HeroPanel title="Your progress">
          {progressQuery.data?.enrolled ? (
            <>
              <div className="font-display text-3xl font-extrabold">{coursePct}%</div>
              <div className="text-xs text-white/60">
                {progressQuery.data.course?.completedLessons ?? 0}/
                {progressQuery.data.course?.totalLessons ?? lessonCount} lessons complete
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-accent-400" style={{ width: `${coursePct}%` }} />
              </div>
            </>
          ) : (
            <div className="text-sm text-white/70">
              Preview mode — enroll in a batch to save watch & reading time.
            </div>
          )}
        </HeroPanel>
      </DashboardHero>

      {course.summary && (
        <p className="max-w-3xl text-sm text-faint">{course.summary}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatChip label="Lessons" value={lessonCount} accent="bg-grad-holo" />
        <StatChip label="Videos" value={videoCount} accent="bg-grad-aqua" />
        <StatChip label="Readings" value={readingCount} accent="bg-grad-sunset" />
        <StatChip label="Modules" value={course.modules.length} accent="bg-grad-mint" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
          {(
            [
              { id: 'learn' as const, label: 'Learn path', icon: PlayCircle },
              ...(canEdit ? [{ id: 'build' as const, label: 'Build', icon: Sparkles }] : []),
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition',
                  active ? 'bg-grad-holo text-white shadow-glow' : 'text-faint hover:bg-chip hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={statusTone(course.status)}>{course.status}</Badge>
          {canPublish && (
            <Button
              size="sm"
              variant={course.status === 'PUBLISHED' ? 'secondary' : 'primary'}
              className={course.status !== 'PUBLISHED' ? 'bg-grad-holo text-white shadow-glow' : undefined}
              loading={publish.isPending}
              onClick={() => publish.mutate(course.status !== 'PUBLISHED')}
            >
              {course.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      {banner && <Alert tone="error">{banner}</Alert>}

      {tab === 'learn' ? (
        <div className="flex flex-col gap-4">
          {course.modules.length === 0 && (
            <Card>
              <p className="text-sm text-faint">No modules yet. Switch to Build to add curriculum.</p>
            </Card>
          )}
          {course.modules.map((m, i) => (
            <Card key={m.id} className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-grad-holo opacity-10 blur-2xl" />
              <h3 className="font-display text-lg font-bold">
                <span className="text-faint">Module {i + 1} · </span>
                {m.title}
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {m.lessons.map((l) => (
                  <LessonRow key={l.id} courseId={id} lesson={l} progress={progressMap.get(l.id)} />
                ))}
                {m.lessons.length === 0 && <li className="text-sm text-faint">No lessons in this module.</li>}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {course.modules.map((m, i) => (
            <ModuleBuilder key={m.id} index={i} module={m} onChange={invalidate} />
          ))}
          <Card>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-sm font-semibold">New module</label>
                <Input
                  className="mt-1.5"
                  value={moduleTitle}
                  onChange={(e) => setModuleTitle(e.target.value)}
                  placeholder="e.g. Pandas Fundamentals"
                />
              </div>
              <Button
                className="bg-grad-holo text-white shadow-glow"
                onClick={() => addModule.mutate()}
                loading={addModule.isPending}
                disabled={moduleTitle.trim().length < 1}
              >
                <Plus className="h-4 w-4" /> Add module
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function LessonRow({
  courseId,
  lesson: l,
  progress,
}: {
  courseId: string;
  lesson: Lesson;
  progress?: LessonProgressRow;
}) {
  const done = progress?.status === 'COMPLETED';
  const watchPct =
    l.durationSec && l.durationSec > 0
      ? Math.min(100, Math.round(((progress?.watchedSec ?? 0) / l.durationSec) * 100))
      : done
        ? 100
        : 0;

  return (
    <li className="rounded-panel border border-hair bg-chip px-3 py-3 dark:bg-soft">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={l.type === 'VIDEO' ? 'brand' : l.type === 'READING' ? 'success' : 'neutral'}>
          {l.type}
        </Badge>
        <span className="font-semibold">{l.title}</span>
        {done && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {formatDuration(l.durationSec) && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-faint">
              <Clock3 className="h-3.5 w-3.5" /> {formatDuration(l.durationSec)}
            </span>
          )}
          {(progress?.watchedSec ?? 0) > 0 && (
            <span className="text-xs font-semibold text-faint">
              {l.type === 'READING' ? 'Time' : 'Watched'} {formatWatch(progress!.watchedSec)}
              {l.type === 'VIDEO' && l.durationSec ? ` · ${watchPct}%` : ''}
            </span>
          )}
          <Link href={`/courses/${courseId}/lessons/${l.id}`}>
            <Button size="sm" className="bg-grad-holo text-white shadow-glow">
              {l.type === 'READING' ? (
                <>
                  <BookOpen className="h-3.5 w-3.5" /> Read in app
                </>
              ) : (
                <>
                  <PlayCircle className="h-3.5 w-3.5" /> Open lesson
                </>
              )}
            </Button>
          </Link>
        </div>
      </div>
      {(progress?.watchedSec ?? 0) > 0 && l.type === 'VIDEO' && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-track">
          <div className="h-full rounded-full bg-grad-aqua" style={{ width: `${watchPct}%` }} />
        </div>
      )}
    </li>
  );
}

function ModuleBuilder({
  index,
  module: mod,
  onChange,
}: {
  index: number;
  module: { id: string; title: string; lessons: Lesson[] };
  onChange: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('VIDEO');
  const [videoUrl, setVideoUrl] = useState('');
  const [body, setBody] = useState('');
  const [openVideoFor, setOpenVideoFor] = useState<string | null>(null);
  const [openReadingFor, setOpenReadingFor] = useState<string | null>(null);
  const [attachUrl, setAttachUrl] = useState('');
  const [durationSec, setDurationSec] = useState('');
  const [readingBody, setReadingBody] = useState('');
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildOk, setBuildOk] = useState<string | null>(null);

  const addLesson = useMutation({
    mutationFn: () =>
      coursesApi.addLesson(mod.id, {
        title: title.trim(),
        type,
        contentUrl: type === 'VIDEO' && videoUrl.trim() ? videoUrl.trim() : undefined,
        body: type === 'READING' && body.trim() ? body.trim() : undefined,
      }),
    onSuccess: () => {
      setTitle('');
      setVideoUrl('');
      setBody('');
      setBuildError(null);
      setBuildOk('Lesson added');
      onChange();
    },
    onError: (e) => setBuildError(e instanceof ApiError ? e.message : 'Failed to add lesson'),
  });

  const setVideo = useMutation({
    mutationFn: (lessonId: string) =>
      liveApi.setLessonVideo(lessonId, {
        contentUrl: attachUrl.trim(),
        durationSec: durationSec ? Number(durationSec) : undefined,
      }),
    onSuccess: () => {
      setAttachUrl('');
      setDurationSec('');
      setOpenVideoFor(null);
      setBuildError(null);
      setBuildOk('Video saved');
      onChange();
    },
    onError: (e) => setBuildError(e instanceof ApiError ? e.message : 'Failed to save video'),
  });

  const saveReading = useMutation({
    mutationFn: (lessonId: string) =>
      coursesApi.updateLesson(lessonId, { type: 'READING', body: readingBody.trim() }),
    onSuccess: () => {
      setOpenReadingFor(null);
      setBuildError(null);
      setBuildOk('Reading saved — students can read it in-app');
      onChange();
    },
    onError: (e) =>
      setBuildError(e instanceof ApiError ? e.message : 'Failed to save reading. Is the API restarted?'),
  });

  const loadTextFile = (file: File | null) => {
    if (!file) return;
    const ok =
      file.type.startsWith('text/') ||
      /\.(txt|md|markdown|csv|json)$/i.test(file.name) ||
      file.type === '';
    if (!ok) {
      setBuildError('Please choose a .txt or .md text file');
      return;
    }
    if (file.size > 200_000) {
      setBuildError('Text file is too large (max ~200KB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setReadingBody(text);
      setBuildError(null);
      setBuildOk(`Loaded ${file.name}`);
    };
    reader.onerror = () => setBuildError('Could not read that file');
    reader.readAsText(file);
  };

  return (
    <Card>
      <h3 className="font-display font-bold">
        <span className="text-faint">{index + 1}.</span> {mod.title}
      </h3>
      {buildError && (
        <Alert tone="error" className="mt-3">
          {buildError}
        </Alert>
      )}
      {buildOk && !buildError && (
        <Alert tone="success" className="mt-3">
          {buildOk}
        </Alert>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {mod.lessons.map((l) => (
          <li key={l.id} className="rounded-panel border border-hair bg-chip px-3 py-2.5 dark:bg-soft">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={l.type === 'VIDEO' ? 'brand' : l.type === 'READING' ? 'success' : 'neutral'}>
                {l.type}
              </Badge>
              <span className="font-semibold">{l.title}</span>
              {l.type === 'VIDEO' && l.contentUrl && (
                <span className="text-xs font-semibold text-success">Video attached</span>
              )}
              {l.type === 'READING' && l.body && (
                <span className="text-xs font-semibold text-success">Article ready</span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                {l.type === 'VIDEO' && (
                  <button
                    type="button"
                    className="text-xs font-bold text-brand-600 hover:underline"
                    onClick={() => {
                      setOpenVideoFor(openVideoFor === l.id ? null : l.id);
                      setOpenReadingFor(null);
                      setAttachUrl(l.contentUrl ?? '');
                      setDurationSec(l.durationSec ? String(l.durationSec) : '');
                    }}
                  >
                    {l.contentUrl ? 'Update video' : 'Attach video URL'}
                  </button>
                )}
                {l.type === 'READING' && (
                  <button
                    type="button"
                    className="text-xs font-bold text-brand-600 hover:underline"
                    onClick={() => {
                      setOpenReadingFor(openReadingFor === l.id ? null : l.id);
                      setOpenVideoFor(null);
                      setReadingBody(l.body ?? '');
                    }}
                  >
                    {l.body ? 'Edit reading' : 'Write reading'}
                  </button>
                )}
              </div>
            </div>

            {openVideoFor === l.id && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                <div>
                  <label className="text-xs font-semibold text-faint">Video URL (YouTube, Vimeo, MP4…)</label>
                  <Input
                    className="mt-1"
                    value={attachUrl}
                    onChange={(e) => setAttachUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-faint">Duration (sec)</label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                    placeholder="e.g. 600"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    onClick={() => setVideo.mutate(l.id)}
                    loading={setVideo.isPending}
                    disabled={!attachUrl.trim().startsWith('http')}
                  >
                    <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Save
                  </Button>
                </div>
              </div>
            )}

            {openReadingFor === l.id && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-faint">
                    Reading body (shown in-app — students never leave FutureCorp)
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-panel bg-chip px-2.5 py-1.5 text-xs font-bold text-brand-600 hover:bg-soft">
                    Upload .txt / .md
                    <input
                      type="file"
                      accept=".txt,.md,.markdown,text/plain,text/markdown"
                      className="sr-only"
                      onChange={(e) => {
                        loadTextFile(e.target.files?.[0] ?? null);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <Textarea
                  rows={8}
                  value={readingBody}
                  onChange={(e) => setReadingBody(e.target.value)}
                  placeholder="Write the lesson article here, or upload a .txt / .md file…"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="bg-grad-holo text-white shadow-glow"
                    onClick={() => {
                      setBuildOk(null);
                      setBuildError(null);
                      saveReading.mutate(l.id);
                    }}
                    loading={saveReading.isPending}
                    disabled={readingBody.trim().length < 1}
                  >
                    Save reading
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
        {mod.lessons.length === 0 && <li className="text-sm text-faint">No lessons yet.</li>}
      </ul>

      <div className="mt-3 flex flex-col gap-2 border-t border-hair pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New lesson title"
            className="min-w-[180px] flex-1"
          />
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-36">
            <option value="VIDEO">Video</option>
            <option value="READING">Reading</option>
            <option value="QUIZ">Quiz</option>
            <option value="ASSIGNMENT">Assignment</option>
          </Select>
          <Button
            size="sm"
            onClick={() => addLesson.mutate()}
            loading={addLesson.isPending}
            disabled={title.trim().length < 1}
          >
            Add
          </Button>
        </div>
        {type === 'VIDEO' && (
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Optional video URL (YouTube / Vimeo / MP4)"
          />
        )}
        {type === 'READING' && (
          <Textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional reading body — editable later too"
          />
        )}
      </div>
    </Card>
  );
}

function StatChip({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute inset-y-0 left-0 w-1', accent)} aria-hidden />
      <div className="pl-1">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">{label}</div>
        <div className="mt-1 font-display text-2xl font-extrabold">{value}</div>
      </div>
    </Card>
  );
}
