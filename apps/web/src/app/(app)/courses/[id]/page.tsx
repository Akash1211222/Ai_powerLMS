'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlayCircle, Link2 } from 'lucide-react';
import { Card, Button, Input, Select, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { coursesApi } from '@/lib/lms-api';
import { liveApi } from '@/lib/live-api';
import { ApiError } from '@/lib/api-client';

export default function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [moduleTitle, setModuleTitle] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const canEdit = user?.permissions.includes('course:update');
  const canPublish = user?.permissions.includes('course:publish');

  const courseQuery = useQuery({ queryKey: ['course', id], queryFn: () => coursesApi.get(id) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['course', id] });

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

  if (courseQuery.isLoading) return <Spinner />;
  const course = courseQuery.data;
  if (!course) return <Alert tone="error">Course not found.</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/courses" className="text-sm font-semibold text-brand-500">
        ← Courses
      </Link>

      <div className="relative overflow-hidden rounded-card border border-hair bg-grad-holo p-6 text-white shadow-card">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-white/70">Course</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-extrabold tracking-tight">{course.title}</h1>
              <Badge tone={statusTone(course.status)}>{course.status}</Badge>
            </div>
            {course.summary && <p className="mt-2 max-w-2xl text-sm text-white/80">{course.summary}</p>}
          </div>
          {canPublish && (
            <Button
              variant={course.status === 'PUBLISHED' ? 'secondary' : 'primary'}
              loading={publish.isPending}
              onClick={() => publish.mutate(course.status !== 'PUBLISHED')}
            >
              {course.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      {banner && <Alert tone="error">{banner}</Alert>}

      <div className="flex flex-col gap-4">
        {course.modules.length === 0 && (
          <Card>
            <p className="text-sm text-faint">No modules yet. Add one to start building the course.</p>
          </Card>
        )}
        {course.modules.map((m, i) => (
          <ModuleCard key={m.id} index={i} module={m} canEdit={Boolean(canEdit)} onChange={invalidate} />
        ))}
      </div>

      {canEdit && (
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
              onClick={() => addModule.mutate()}
              loading={addModule.isPending}
              disabled={moduleTitle.trim().length < 1}
            >
              Add module
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ModuleCard({
  index,
  module: mod,
  canEdit,
  onChange,
}: {
  index: number;
  module: {
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      contentUrl?: string | null;
      durationSec?: number | null;
    }>;
  };
  canEdit: boolean;
  onChange: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('VIDEO');
  const [videoUrl, setVideoUrl] = useState('');
  const [openVideoFor, setOpenVideoFor] = useState<string | null>(null);
  const [attachUrl, setAttachUrl] = useState('');

  const addLesson = useMutation({
    mutationFn: () =>
      coursesApi.addLesson(mod.id, {
        title: title.trim(),
        type,
        contentUrl: type === 'VIDEO' && videoUrl.trim() ? videoUrl.trim() : undefined,
      }),
    onSuccess: () => {
      setTitle('');
      setVideoUrl('');
      onChange();
    },
  });

  const setVideo = useMutation({
    mutationFn: (lessonId: string) =>
      liveApi.setLessonVideo(lessonId, { contentUrl: attachUrl.trim() }),
    onSuccess: () => {
      setAttachUrl('');
      setOpenVideoFor(null);
      onChange();
    },
  });

  return (
    <Card>
      <h3 className="font-display font-bold">
        <span className="text-faint">{index + 1}.</span> {mod.title}
      </h3>
      <ul className="mt-3 flex flex-col gap-2">
        {mod.lessons.map((l) => (
          <li key={l.id} className="rounded-panel border border-hair bg-chip/80 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={l.type === 'VIDEO' ? 'brand' : 'neutral'}>{l.type}</Badge>
              <span className="font-semibold">{l.title}</span>
              {l.contentUrl && (
                <a
                  href={l.contentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                >
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                  Watch
                </a>
              )}
              {canEdit && l.type === 'VIDEO' && (
                <button
                  type="button"
                  className="ml-auto text-xs font-bold text-brand-600 hover:underline"
                  onClick={() => {
                    setOpenVideoFor(openVideoFor === l.id ? null : l.id);
                    setAttachUrl(l.contentUrl ?? '');
                  }}
                >
                  {l.contentUrl ? 'Update video' : 'Upload video URL'}
                </button>
              )}
            </div>
            {openVideoFor === l.id && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label className="text-xs font-semibold text-faint">Video URL (YouTube, Vimeo, MP4…)</label>
                  <Input
                    className="mt-1"
                    value={attachUrl}
                    onChange={(e) => setAttachUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
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
            )}
          </li>
        ))}
        {mod.lessons.length === 0 && <li className="text-sm text-faint">No lessons yet.</li>}
      </ul>
      {canEdit && (
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
              placeholder="Optional video URL for this lesson"
            />
          )}
        </div>
      )}
    </Card>
  );
}
