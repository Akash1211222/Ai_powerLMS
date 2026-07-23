'use client';

import { useAuth } from '@/lib/auth-context';
import { StudentDashboard } from '@/components/student-dashboard';
import { TrainerDashboard } from '@/components/trainer-dashboard';

// Every non-learner role. Placement officers and mentors belong here too:
// without them the student view renders for staff, telling a placement officer
// they are "0% through your courses" and "not placement ready" — nonsense for
// someone who has never been a learner.
const STAFF_ROLES = [
  'TRAINER',
  'BATCH_MANAGER',
  'COLLEGE_ADMIN',
  'SUPER_ADMIN',
  'PLACEMENT_OFFICER',
  'MENTOR',
];

/**
 * Role-aware dashboard. Staff see the staff view of their batches and at-risk
 * students; learners see their own progress. Both render REAL aggregated data
 * from the API — no mock metrics.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const firstName = user.profile?.firstName ?? user.email;
  const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r.role));

  return isStaff ? (
    <TrainerDashboard firstName={firstName} />
  ) : (
    <StudentDashboard firstName={firstName} />
  );
}
