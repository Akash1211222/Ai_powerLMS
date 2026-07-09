import { apiRequest } from './api-client';

export interface Session {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  batch: { name: string; course?: { title: string } };
}

export interface StudentDashboard {
  stats: {
    activeCourses: number;
    avgProgress: number;
    completedLessons: number;
    upcomingSessions: number;
    attendanceRate: number;
  };
  enrollments: Array<{
    id: string;
    status: string;
    course: { id: string; title: string; level: string; status: string };
    batch: { id: string; name: string; code: string } | null;
    progress: { percent: number; completedLessons: number; totalLessons: number } | null;
  }>;
  todaySessions: Session[];
  upcomingSessions: Session[];
}

export interface TrainerDashboard {
  stats: { totalBatches: number; totalStudents: number; avgProgress: number };
  batches: Array<{
    id: string;
    name: string;
    code: string;
    status: string;
    role: string;
    courseTitle: string;
    studentCount: number;
    avgProgress: number;
  }>;
  upcomingSessions: Session[];
}

export const dashboardApi = {
  student: () => apiRequest<StudentDashboard>('/dashboard/student', { auth: true }),
  trainer: () => apiRequest<TrainerDashboard>('/dashboard/trainer', { auth: true }),
};
