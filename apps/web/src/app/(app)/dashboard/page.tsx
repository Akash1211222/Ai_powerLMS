'use client';

import { useAuth } from '@/lib/auth-context';
import { StudentDashboard } from '@/components/student-dashboard';
import { TrainerDashboard } from '@/components/trainer-dashboard';

const STAFF_ROLES = ['TRAINER', 'BATCH_MANAGER', 'COLLEGE_ADMIN', 'SUPER_ADMIN'];

/**
 * Role-aware dashboard. Staff (trainers/managers/admins) see the trainer view
 * of their batches; everyone else sees the student view of their learning.
 * Both render REAL aggregated data from the API — no mock metrics.
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
