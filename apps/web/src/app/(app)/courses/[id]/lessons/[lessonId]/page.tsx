'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  PlayCircle,
} from 'lucide-react';
import { Badge, Button, Spinner, Alert, cn } from '@fca/ui';
import { coursesApi, type Lesson } from '@/lib/lms-api';
import { liveApi } from '@/lib/live-api';
import { ApiError } from '@/lib/api-client';
import { LessonVideoPlayer } from '@/components/lesson-video-player';
import { ReadingViewer } from '@/components/reading-viewer';
import { LiveSessionNotesRail } from '@/components/live-session-notes-rail';
import { formatDuration, formatWatch } from '@/lib/video-source';

export default function LessonLearnPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id: courseId, lessonId } = use(params);
  const qc = useQueryClient();
  const [trackError, setTrackError] = useState<string | null>(null);

  const courseQuery = useQuery({ queryKey: ['course', courseId], queryFn: () => coursesApi.get(courseId) });
  const progressQuery = useQuery({
    queryKey: ['course', courseId, 'progress'],
    queryFn: () => coursesApi.myProgress(courseId),
  });

  const flatLessons = useMemo(() => {
    const course = courseQuery.data;
    if (!course) return [] as Array<Lesson & { moduleTitle: string; moduleId: string }>;
    return course.modules.flatMap((m) =>
      m.lessons.map((l) => ({ ...l, moduleTitle: m.title, moduleId: m.id })),
    );
  }, [courseQuery.data]);

  const index = flatLessons.findIndex((l) => l.id === lessonId);
  const lesson = index >= 0 ? flatLessons[index] : null;
  const prev = index > 0 ? flatLessons[index - 1] : null;
  const next = index >= 0 && index < flatLessons.length - 1 ? flatLessons[index + 1] : null;

  const myRow = progressQuery.data?.lessons.find((p) => p.lessonId === lessonId);
  const progressMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof progressQuery.data>['lessons'][number]>();
    for (const p of progressQuery.data?.lessons ?? []) map.set(p.lessonId, p);
    return map;
  }, [progressQuery.data]);

  const maxWatched = useRef(myRow?.watchedSec ?? 0);
  useEffect(() => {
    maxWatched.current = Math.max(maxWatched.current, myRow?.watchedSec ?? 0);
  }, [myRow?.watchedSec, lessonId]);

  const track = useMutation({
    mutationFn: (input: { positionSec: number; watchedSec: number; completed?: boolean }) =>
      liveApi.trackProgress(lessonId, {
        positionSec: input.positionSec,
        watchedSec: Math.max(maxWatched.current, input.watchedSec),
        completed: input.completed,
      }),
    onSuccess: () => {
      setTrackError(null);
      qc.invalidateQueries({ queryKey: ['course', courseId, 'progress'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 403) {
        setTrackError('Progress is saved only when you are enrolled in this course.');
        return;
      }
      setTrackError(e instanceof ApiError ? e.message : 'Could not save progress');
    },
  });

  const lastSent = useRef(0);
  const sendProgress = (input: { positionSec: number; watchedSec: number; completed?: boolean }) => {
    maxWatched.current = Math.max(maxWatched.current, input.watchedSec);
    const now = Date.now();
    if (!input.completed && now - lastSent.current < 8000) return;
    lastSent.current = now;
    track.mutate({
      positionSec: input.positionSec,
      watchedSec: maxWatched.current,
      completed: input.completed,
    });
  };

  if (courseQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const course = courseQuery.data;
  if (!course || !lesson) return <Alert tone="error">Lesson not found.</Alert>;

  const pct =
    lesson.durationSec && lesson.durationSec > 0
      ? Math.min(100, Math.round((maxWatched.current / lesson.durationSec) * 100))
      : myRow?.status === 'COMPLETED'
        ? 100
        : lesson.type === 'READING'
          ? Math.min(100, myRow?.lastPositionSec ?? 0)
          : 0;

  const completed = myRow?.status === 'COMPLETED';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/courses/${courseId}`}
          className="inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> {course.title}
        </Link>
        <div className="flex items-center gap-2 text-xs font-semibold text-faint">
          <span>
            Lesson {index + 1} / {flatLessons.length}
          </span>
          {progressQuery.data?.enrolled && progressQuery.data.course && (
            <span className="rounded-full bg-chip px-2 py-1 text-brand-600">
              Course {progressQuery.data.course.percent}%
            </span>
          )}
        </div>
      </div>

      <section className="relative overflow-hidden rounded-card bg-grad-holo p-5 text-white shadow-card sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">
              {lesson.moduleTitle}
            </p>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              {lesson.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/75">
              <Badge tone={lesson.type === 'VIDEO' ? 'brand' : 'neutral'} className="bg-white/15 text-white">
                {lesson.type}
              </Badge>
              {formatDuration(lesson.durationSec) && (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" /> {formatDuration(lesson.durationSec)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                Watched {formatWatch(maxWatched.current)}
                {completed && (
                  <>
                    <CheckCircle2 className="ml-1 h-3.5 w-3.5 text-accent-300" /> Done
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="min-w-[140px]">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-white/60">Progress</div>
            <div className="mt-1 font-display text-2xl font-extrabold">{pct}%</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-accent-400 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {trackError && <Alert tone="info">{trackError}</Alert>}

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {lesson.type === 'VIDEO' ? (
            lesson.contentUrl ? (
              <LessonVideoPlayer
                key={lesson.id}
                contentUrl={lesson.contentUrl}
                title={lesson.title}
                startAt={myRow?.lastPositionSec ?? 0}
                durationSec={lesson.durationSec}
                onProgress={sendProgress}
              />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card border border-dashed border-hair bg-panel">
                <PlayCircle className="h-8 w-8 text-faint" />
                <p className="text-sm font-semibold text-faint">Instructor has not attached a video yet.</p>
              </div>
            )
          ) : lesson.type === 'READING' ? (
            <ReadingViewer
              title={lesson.title}
              body={lesson.body}
              spentSec={myRow?.watchedSec ?? 0}
              completed={completed}
              onProgress={sendProgress}
              onMarkComplete={() =>
                sendProgress({
                  positionSec: 100,
                  watchedSec: Math.max(maxWatched.current, 30),
                  completed: true,
                })
              }
            />
          ) : (
            <div className="rounded-card border border-hair bg-panel p-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-faint" />
              <p className="mt-3 font-display text-lg font-bold">This lesson type opens in its own module</p>
              <p className="mt-1 text-sm text-faint">
                {lesson.type === 'QUIZ' && 'Head to Assessments when this quiz is published.'}
                {lesson.type === 'ASSIGNMENT' && 'Head to Assignments for the linked task.'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {prev ? (
              <Link href={`/courses/${courseId}/lessons/${prev.id}`}>
                <Button variant="secondary" size="sm">
                  <ChevronLeft className="h-4 w-4" /> {prev.title}
                </Button>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/courses/${courseId}/lessons/${next.id}`}>
                <Button size="sm" className="bg-grad-holo text-white shadow-glow">
                  {next.title} <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Link href={`/courses/${courseId}`}>
                <Button size="sm" className="bg-grad-sunset text-white shadow-glow">
                  Back to course
                </Button>
              </Link>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <LiveSessionNotesRail courseId={courseId} compact />
          <div className="rounded-card border border-hair bg-panel p-3 shadow-card">
            <h2 className="px-1 font-display text-sm font-bold">Syllabus</h2>
            <ul className="mt-2 flex max-h-[min(70vh,640px)] flex-col gap-1 overflow-y-auto">
              {flatLessons.map((l, i) => {
                const row = progressMap.get(l.id);
                const active = l.id === lessonId;
                const done = row?.status === 'COMPLETED';
                return (
                  <li key={l.id}>
                    <Link
                      href={`/courses/${courseId}/lessons/${l.id}`}
                      className={cn(
                        'flex items-start gap-2 rounded-panel px-2.5 py-2 text-sm transition',
                        active ? 'bg-grad-holo text-white shadow-glow' : 'hover:bg-chip',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold',
                          active ? 'bg-white/20' : done ? 'bg-success/15 text-success' : 'bg-chip text-faint',
                        )}
                      >
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{l.title}</span>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wide', active ? 'text-white/70' : 'text-faint')}>
                          {l.type}
                          {row && row.watchedSec > 0 ? ` · ${formatWatch(row.watchedSec)}` : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
