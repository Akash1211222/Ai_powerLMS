'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Input, Select, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { coursesApi } from '@/lib/lms-api';
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

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{course.title}</h1>
            <Badge tone={statusTone(course.status)}>{course.status}</Badge>
          </div>
          {course.summary && <p className="mt-1 text-sm text-faint">{course.summary}</p>}
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
  module: { id: string; title: string; lessons: { id: string; title: string; type: string }[] };
  canEdit: boolean;
  onChange: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('VIDEO');
  const addLesson = useMutation({
    mutationFn: () => coursesApi.addLesson(mod.id, { title: title.trim(), type }),
    onSuccess: () => {
      setTitle('');
      onChange();
    },
  });

  return (
    <Card>
      <h3 className="font-bold">
        <span className="text-faint">{index + 1}.</span> {mod.title}
      </h3>
      <ul className="mt-3 flex flex-col gap-1.5">
        {mod.lessons.map((l) => (
          <li key={l.id} className="flex items-center gap-2 text-sm">
            <Badge tone="brand">{l.type}</Badge>
            <span>{l.title}</span>
          </li>
        ))}
        {mod.lessons.length === 0 && <li className="text-sm text-faint">No lessons yet.</li>}
      </ul>
      {canEdit && (
        <div className="mt-3 flex items-end gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New lesson title"
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
      )}
    </Card>
  );
}
