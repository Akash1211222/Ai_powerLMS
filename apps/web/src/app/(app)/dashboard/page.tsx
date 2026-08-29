'use client';

import { useAuth } from '@/lib/auth-context';
import { StudentDashboard } from '@/components/student-dashboard';
import { TrainerDashboard } from '@/components/trainer-dashboard';
import { PlacementDashboard } from '@/components/placement-dashboard';
import { AdminDashboard } from '@/components/admin-dashboard';

/**
 * Role-aware dashboard routing. Priority: college admin → placement officer →
 * trainer/staff → student. Each view loads real aggregated API data.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const firstName = user.profile?.firstName ?? user.email;
  const roles = user.roles.map((r) => r.role);

  // An operations lead runs colleges rather than studying at one, so they get
  // the admin view of whichever college the switcher is pointing at. Without
  // this they fell through to the student dashboard and were told they were not
  // enrolled in any course.
  if (roles.some((r) => r === 'COLLEGE_ADMIN' || r === 'SUPER_ADMIN' || r === 'OPERATIONAL_LEAD')) {
    return <AdminDashboard firstName={firstName} />;
  }
  if (roles.includes('PLACEMENT_OFFICER')) {
    return <PlacementDashboard firstName={firstName} />;
  }
  if (roles.some((r) => r === 'TRAINER' || r === 'BATCH_MANAGER')) {
    return <TrainerDashboard firstName={firstName} />;
  }
  return <StudentDashboard firstName={firstName} />;
}
