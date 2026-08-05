import { apiRequest } from './api-client';
import type { Paginated } from '@fca/shared';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: string;
  isPrimary?: boolean;
}

export interface CourseSummary {
  id: string;
  title: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  level: string;
  summary: string | null;
  _count?: { modules: number; enrollments: number };
}

export interface Lesson {
  id: string;
  title: string;
  type: 'VIDEO' | 'READING' | 'QUIZ' | 'ASSIGNMENT';
  order: number;
  durationSec: number | null;
  contentUrl?: string | null;
  thumbnailUrl?: string | null;
  body?: string | null;
}

export interface LessonProgressRow {
  lessonId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  lastPositionSec: number;
  watchedSec: number;
  completedAt: string | null;
}

export interface CourseMyProgress {
  enrolled: boolean;
  course: {
    completedLessons: number;
    totalLessons: number;
    percent: number;
    lastActivityAt: string | null;
  } | null;
  lessons: LessonProgressRow[];
}
export interface CourseModule {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}
export interface CourseDetail extends CourseSummary {
  description: string | null;
  modules: CourseModule[];
}

export interface BatchSummary {
  id: string;
  name: string;
  code: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  course: { id: string; title: string };
  _count?: { students: number; trainers: number };
}

export const orgApi = {
  mine: () => apiRequest<Organization[]>('/me/organizations', { auth: true }),
};

export const coursesApi = {
  list: (organizationId: string) =>
    apiRequest<Paginated<CourseSummary>>(
      `/courses?organizationId=${encodeURIComponent(organizationId)}&pageSize=100`,
      { auth: true },
    ),
  get: (id: string) => apiRequest<CourseDetail>(`/courses/${id}`, { auth: true }),
  create: (input: { organizationId: string; title: string; summary?: string }) =>
    apiRequest<CourseDetail>('/courses', { method: 'POST', body: input, auth: true }),
  addModule: (courseId: string, title: string) =>
    apiRequest<CourseModule>(`/courses/${courseId}/modules`, {
      method: 'POST',
      body: { title },
      auth: true,
    }),
  addLesson: (
    moduleId: string,
    input: { title: string; type: string; contentUrl?: string; body?: string; durationSec?: number },
  ) =>
    apiRequest<Lesson>(`/courses/modules/${moduleId}/lessons`, {
      method: 'POST',
      body: input,
      auth: true,
    }),
  updateLesson: (
    lessonId: string,
    input: {
      title?: string;
      type?: string;
      contentUrl?: string | null;
      body?: string | null;
      durationSec?: number | null;
      thumbnailUrl?: string | null;
    },
  ) =>
    apiRequest<Lesson>(`/courses/lessons/${lessonId}`, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  myProgress: (courseId: string) =>
    apiRequest<CourseMyProgress>(`/courses/${courseId}/progress`, { auth: true }),
  publish: (id: string) =>
    apiRequest<CourseSummary>(`/courses/${id}/publish`, { method: 'POST', auth: true }),
  unpublish: (id: string) =>
    apiRequest<CourseSummary>(`/courses/${id}/unpublish`, { method: 'POST', auth: true }),
};

export const batchesApi = {
  list: (organizationId: string) =>
    apiRequest<Paginated<BatchSummary>>(
      `/batches?organizationId=${encodeURIComponent(organizationId)}&pageSize=100`,
      { auth: true },
    ),
  get: (id: string) => apiRequest<unknown>(`/batches/${id}`, { auth: true }),
  create: (input: { organizationId: string; courseId: string; name: string }) =>
    apiRequest<BatchSummary>('/batches', { method: 'POST', body: input, auth: true }),
  students: (id: string) => apiRequest<unknown[]>(`/batches/${id}/students`, { auth: true }),
  addStudent: (id: string, email: string) =>
    apiRequest<{ success: true }>(`/batches/${id}/students`, {
      method: 'POST',
      body: { email },
      auth: true,
    }),
};
