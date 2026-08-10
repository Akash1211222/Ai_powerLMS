import { apiRequest } from './api-client';
import type { Paginated } from '@fca/shared';

export type CodeLanguage =
  | 'NONE'
  | 'PYTHON'
  | 'JAVASCRIPT'
  | 'TYPESCRIPT'
  | 'JAVA'
  | 'C'
  | 'CPP'
  | 'SQL'
  | 'WEB';

export interface AssignmentSummary {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  difficulty: string;
  maxScore: number;
  dueAt: string | null;
  aiEvaluationEnabled: boolean;
  language?: CodeLanguage;
  starterCode?: string | null;
  aiGenerated?: boolean;
  batchId: string;
  _count?: { submissions: number; criteria: number };
}

/** Staff view of one assignment — includes drafts and the full brief. */
export interface StaffAssignment extends AssignmentSummary {
  description: string | null;
  instructions: string | null;
  criteria: Array<{ id: string; title: string; description: string | null; weight: number }>;
  _count?: { submissions: number; criteria: number };
}

export interface AssignmentMine {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  status: string;
  maxScore: number;
  dueAt: string | null;
  difficulty: string;
  language?: CodeLanguage;
  starterCode?: string | null;
  aiGenerated?: boolean;
  criteria?: Array<{ id: string; title: string; description: string | null; weight: number }>;
  submissions?: Array<{
    id: string;
    status: string;
    attemptNumber: number;
    submittedAt: string | null;
    evaluation?: {
      status: string;
      finalScore: number | null;
      aiScore: number | null;
      trainerScore: number | null;
    } | null;
  }>;
}

export interface AssignmentDetailMine {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    status: string;
    maxScore: number;
    language?: CodeLanguage;
    starterCode?: string | null;
    aiGenerated?: boolean;
    difficulty?: string;
    criteria: Array<{ id: string; title: string; description: string | null; weight: number }>;
  };
  submission: {
    id: string;
    status: string;
    contentText: string | null;
    codeOutput?: string | null;
    repoUrl: string | null;
    submittedAt: string | null;
    evaluation: {
      status: string;
      aiScore: number | null;
      trainerScore: number | null;
      finalScore: number | null;
      reason: string | null;
      confidence: number | null;
      criterionScores?: Array<{ criterionId: string; score: number; comment: string | null }>;
    } | null;
  } | null;
}

export interface SubmissionRow {
  id: string;
  status: string;
  contentText: string | null;
  codeOutput?: string | null;
  repoUrl: string | null;
  submittedAt: string | null;
  student: {
    id: string;
    email: string;
    profile: { firstName: string; lastName: string } | null;
  };
  evaluation: {
    id: string;
    status: string;
    aiScore: number | null;
    trainerScore: number | null;
    finalScore: number | null;
    reason: string | null;
    confidence: number | null;
  } | null;
}

export interface RunCodeResult {
  language: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  compileOutput?: string;
  previewHtml?: string;
}

export interface SubmitResult {
  id: string;
  status: string;
  evaluation: {
    status: string;
    aiScore: number | null;
    trainerScore: number | null;
    finalScore: number | null;
    reason: string | null;
    confidence: number | null;
    criterionScores?: Array<{ criterionId: string; score: number; comment: string | null }>;
  } | null;
}

export const codeApi = {
  run: (input: { language: Exclude<CodeLanguage, 'NONE'>; source: string; stdin?: string }) =>
    apiRequest<RunCodeResult>('/code/run', { method: 'POST', body: input, auth: true }),
};

export const assignmentsApi = {
  listForBatch: (batchId: string) =>
    apiRequest<AssignmentSummary[]>(
      `/assignments?batchId=${encodeURIComponent(batchId)}`,
      { auth: true },
    ),
  create: (input: {
    batchId: string;
    title: string;
    description?: string;
    instructions?: string;
    difficulty?: string;
    maxScore?: number;
    aiEvaluationEnabled?: boolean;
    language?: CodeLanguage;
    starterCode?: string | null;
    publish?: boolean;
    criteria: Array<{ title: string; description?: string; weight: number }>;
  }) => apiRequest<AssignmentSummary>('/assignments', { method: 'POST', body: input, auth: true }),
  /** Always returns a DRAFT — the trainer reviews, then publishes. */
  aiGenerate: (input: {
    batchId: string;
    topicHint: string;
    difficulty?: string;
    languageHint?: CodeLanguage;
  }) =>
    apiRequest<AssignmentSummary>('/assignments/ai-generate', {
      method: 'POST',
      body: input,
      auth: true,
    }),
  /** Staff read: works on drafts, unlike the student endpoint. */
  getForStaff: (id: string) => apiRequest<StaffAssignment>(`/assignments/${id}`, { auth: true }),
  /** Edits a DRAFT. Sending `criteria` replaces the whole rubric. */
  update: (
    id: string,
    input: {
      title?: string;
      description?: string;
      instructions?: string;
      maxScore?: number;
      starterCode?: string | null;
      criteria?: Array<{ title: string; description?: string; weight: number }>;
    },
  ) => apiRequest<StaffAssignment>(`/assignments/${id}`, { method: 'PATCH', body: input, auth: true }),
  publish: (id: string) =>
    apiRequest<AssignmentSummary>(`/assignments/${id}/publish`, { method: 'POST', auth: true }),
  submissions: (id: string) =>
    apiRequest<SubmissionRow[]>(`/assignments/${id}/submissions`, { auth: true }),
  submit: (id: string, input: { contentText?: string; codeOutput?: string; repoUrl?: string }) =>
    apiRequest<SubmitResult>(`/assignments/${id}/submit`, {
      method: 'POST',
      body: input,
      auth: true,
    }),
  evaluate: (submissionId: string) =>
    apiRequest<unknown>(`/assignments/submissions/${submissionId}/evaluate`, {
      method: 'POST',
      auth: true,
    }),
  review: (submissionId: string, trainerScore: number, reason?: string) =>
    apiRequest<unknown>(`/assignments/submissions/${submissionId}/review`, {
      method: 'POST',
      body: { trainerScore, release: true, reason },
      auth: true,
    }),
  mine: () => apiRequest<AssignmentMine[]>('/me/assignments', { auth: true }),
  getMine: (id: string) =>
    apiRequest<AssignmentDetailMine>(`/me/assignments/${id}`, { auth: true }),
};

export interface AssessmentSummary {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  timeLimitMin: number | null;
  passingScore: number | null;
  dueAt: string | null;
  batchId: string;
  _count?: { questions: number; attempts: number };
}

/** Staff-only view of a quiz: prompts, options and which option is correct. */
export interface StaffAssessment extends AssessmentSummary {
  description: string | null;
  questions: Array<{
    id: string;
    type: string;
    prompt: string;
    topic: string | null;
    explanation: string | null;
    points: number;
    options: Array<{ id: string; text: string; isCorrect: boolean }>;
  }>;
}

export interface AssessmentMine {
  id: string;
  title: string;
  description: string | null;
  status: string;
  timeLimitMin: number | null;
  passingScore: number | null;
  dueAt: string | null;
  _count?: { questions: number };
  attempts?: Array<{
    id: string;
    status: string;
    percent: number | null;
    attemptNumber: number;
  }>;
}

export interface AttemptStart {
  attemptId: string;
  assessmentId: string;
  timeLimitMin: number | null;
  questions: Array<{
    id: string;
    type: string;
    prompt: string;
    points: number;
    options: Array<{ id: string; text: string }>;
  }>;
}

export interface AttemptResult {
  attemptId?: string;
  id?: string;
  status?: string;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  topics?: Array<{ topic: string; correct: number; total: number; percent: number }>;
  topicPerformance?: Array<{ topic: string; correct: number; total: number; percent: number }>;
}

export const assessmentsApi = {
  listForBatch: (batchId: string) =>
    apiRequest<AssessmentSummary[]>(
      `/assessments?batchId=${encodeURIComponent(batchId)}`,
      { auth: true },
    ),
  create: (input: {
    batchId: string;
    title: string;
    description?: string;
    timeLimitMin?: number;
    passingScore?: number;
    questions: Array<{
      type: string;
      prompt: string;
      topic?: string;
      points?: number;
      options?: Array<{ text: string; isCorrect?: boolean }>;
      correctText?: string;
    }>;
  }) => apiRequest<AssessmentSummary>('/assessments', { method: 'POST', body: input, auth: true }),
  /** Always returns a DRAFT — the trainer reviews, then publishes. */
  aiGenerate: (input: {
    batchId: string;
    topicHint?: string;
    difficulty?: string;
    questionCount?: number;
  }) =>
    apiRequest<AssessmentSummary>('/assessments/ai-generate', {
      method: 'POST',
      body: input,
      auth: true,
    }),
  /** Staff view: questions WITH the answer key, for review before publishing. */
  getForStaff: (id: string) =>
    apiRequest<StaffAssessment>(`/assessments/${id}`, { auth: true }),
  /** Edits a DRAFT. Sending `questions` replaces the whole paper. */
  update: (
    id: string,
    input: {
      title?: string;
      description?: string;
      timeLimitMin?: number;
      passingScore?: number;
      questions?: Array<{
        type: string;
        prompt: string;
        topic?: string;
        explanation?: string;
        points?: number;
        options?: Array<{ text: string; isCorrect?: boolean }>;
      }>;
    },
  ) =>
    apiRequest<StaffAssessment>(`/assessments/${id}`, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  publish: (id: string) =>
    apiRequest<AssessmentSummary>(`/assessments/${id}/publish`, { method: 'POST', auth: true }),
  start: (id: string) =>
    apiRequest<AttemptStart>(`/assessments/${id}/attempts`, { method: 'POST', auth: true }),
  submit: (
    attemptId: string,
    answers: Array<{ questionId: string; selectedOptionIds?: string[]; textAnswer?: string }>,
  ) =>
    apiRequest<AttemptResult>(`/assessments/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: { answers },
      auth: true,
    }),
  mine: () => apiRequest<AssessmentMine[]>('/me/assessments', { auth: true }),
  getAttempt: (id: string) =>
    apiRequest<AttemptResult>(`/me/assessments/attempts/${id}`, { auth: true }),
};

export interface AttendanceSession {
  id: string;
  title: string;
  sessionDate: string;
  status: 'OPEN' | 'CLOSED';
  batchId: string;
  _count?: { records: number };
}

export interface AttendanceSessionDetail extends AttendanceSession {
  records: Array<{
    id: string;
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    note: string | null;
    student: {
      id: string;
      email: string;
      profile: { firstName: string; lastName: string } | null;
    };
  }>;
}

export interface MyAttendance {
  summary: {
    rate: number;
    present: number;
    total: number;
    late: number;
    absent: number;
    excused: number;
  };
  records: Array<{
    id: string;
    status: string;
    session: { id: string; title: string; sessionDate: string };
  }>;
}

export const attendanceApi = {
  listSessions: (batchId: string) =>
    apiRequest<AttendanceSession[]>(
      `/attendance/sessions?batchId=${encodeURIComponent(batchId)}`,
      { auth: true },
    ),
  createSession: (batchId: string, title: string) =>
    apiRequest<AttendanceSession>('/attendance/sessions', {
      method: 'POST',
      body: { batchId, title },
      auth: true,
    }),
  getSession: (id: string) =>
    apiRequest<AttendanceSessionDetail>(`/attendance/sessions/${id}`, { auth: true }),
  mark: (
    sessionId: string,
    records: Array<{ studentId: string; status: string; note?: string }>,
  ) =>
    apiRequest<unknown>(`/attendance/sessions/${sessionId}/mark`, {
      method: 'POST',
      body: { records },
      auth: true,
    }),
  mine: () => apiRequest<MyAttendance>('/attendance/me', { auth: true }),
  requestCorrection: (recordId: string, requestedStatus: string, reason: string) =>
    apiRequest<unknown>(`/attendance/records/${recordId}/corrections`, {
      method: 'POST',
      body: { requestedStatus, reason },
      auth: true,
    }),
};

export interface AdminMember {
  id: string;
  user: {
    id: string;
    email: string;
    status: string;
    profile: { firstName: string; lastName: string } | null;
    roles: string[];
  };
}

export const adminApi = {
  members: (organizationId: string) =>
    apiRequest<Paginated<AdminMember>>(
      `/admin/members?organizationId=${encodeURIComponent(organizationId)}&pageSize=100`,
      { auth: true },
    ),
  /**
   * Create a member. Replaces self-signup — the response carries the issued
   * password exactly once, so the caller must show it before discarding.
   */
  createMember: (input: {
    organizationId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  }) =>
    apiRequest<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      password: string;
    }>('/admin/members', { method: 'POST', body: input, auth: true }),

  grantRole: (organizationId: string, userId: string, role: string) =>
    apiRequest<unknown>('/admin/roles/grant', {
      method: 'POST',
      body: { organizationId, userId, role },
      auth: true,
    }),
  revokeRole: (organizationId: string, userId: string, role: string) =>
    apiRequest<unknown>('/admin/roles/revoke', {
      method: 'POST',
      body: { organizationId, userId, role },
      auth: true,
    }),
  flags: () =>
    apiRequest<Array<{ id: string; key: string; enabled: boolean; description: string | null }>>(
      '/admin/feature-flags',
      { auth: true },
    ),
  setFlag: (key: string, enabled: boolean) =>
    apiRequest<unknown>(`/admin/feature-flags/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: { enabled },
      auth: true,
    }),
};
