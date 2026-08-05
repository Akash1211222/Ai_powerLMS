import { apiRequest } from './api-client';

export interface Session {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetingUrl?: string | null;
  status?: string;
  batch: { name: string; course?: { title: string } };
}

export interface Deadline {
  id: string;
  kind: 'ASSIGNMENT' | 'ASSESSMENT';
  title: string;
  dueAt: string | null;
  batchName: string;
}

export interface RecentGrade {
  kind: 'ASSIGNMENT' | 'ASSESSMENT';
  title: string;
  percent: number;
  at: string;
}

export interface StudentDashboard {
  stats: {
    activeCourses: number;
    avgProgress: number;
    completedLessons: number;
    upcomingSessions: number;
    attendanceRate: number;
    pendingDeadlines: number;
    openJobs: number;
    myApplications: number;
    attendanceStreak: number;
    longestStreak: number;
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
  deadlines: Deadline[];
  recentGrades: RecentGrade[];
  attendanceTrend: Array<{ date: string; value: number }>;
  nextLiveClass: Session | null;
  nextMentorSession: {
    id: string;
    topic: string;
    scheduledAt: string;
    status: string;
    meetingUrl: string | null;
    mentor: { profile: { firstName: string; lastName: string } | null };
  } | null;
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

export interface PlacementDashboard {
  stats: {
    openJobs: number;
    totalJobs: number;
    totalApplications: number;
    placed: number;
    placementRate: number;
    studentsLooking: number;
  };
  funnel: Record<string, number>;
  recentJobs: Array<{
    id: string;
    title: string;
    companyName: string;
    status: string;
    _count: { applications: number };
  }>;
}

export interface AdminDashboard {
  stats: {
    members: number;
    courses: number;
    batches: number;
    activeStudents: number;
    avgProgress: number;
    attendanceRate: number;
    openJobs: number;
    placed: number;
  };
  activeBatches: Array<{
    id: string;
    name: string;
    code: string;
    courseTitle: string;
    studentCount: number;
  }>;
}

export const dashboardApi = {
  student: () => apiRequest<StudentDashboard>('/dashboard/student', { auth: true }),
  trainer: () => apiRequest<TrainerDashboard>('/dashboard/trainer', { auth: true }),
  placement: (organizationId: string) =>
    apiRequest<PlacementDashboard>(
      `/dashboard/placement?organizationId=${encodeURIComponent(organizationId)}`,
      { auth: true },
    ),
  admin: (organizationId: string) =>
    apiRequest<AdminDashboard>(
      `/dashboard/admin?organizationId=${encodeURIComponent(organizationId)}`,
      { auth: true },
    ),
};
