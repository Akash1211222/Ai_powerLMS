import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  BrainCircuit,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Database,
  FileBarChart,
  FileCheck2,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
} from 'lucide-react';

/**
 * Which screens a person is offered.
 *
 * This used to be decided inline in the layout, and half of it was not decided
 * at all: seven items were pinned visible for everyone. A Batch Manager — whose
 * job is batches, sessions and student records — was handed Skills, Career,
 * Mentorship and Alumni, none of which they can act on. The permissions were
 * always right; nothing asked them.
 *
 * Kept as a pure function so every role's menu can be asserted against the real
 * permission matrix in a test, rather than being re-read by eye whenever
 * somebody adds a page.
 */

export type TenantKind = 'COLLEGE' | 'COMPANY' | 'INTERNAL';

export interface NavContext {
  permissions: string[];
  /**
   * How many organisations this person belongs to. Almost everyone belongs to
   * one and never thinks about it; an operations lead belongs to several, and
   * only then is a page comparing them worth a place in the menu.
   */
  orgCount?: number;
  /**
   * Which kind of customer this person belongs to. Nothing keys off it yet —
   * permissions alone produce the right menu today, and gating on tenant would
   * risk hiding a feature a college has paid for. It is threaded through
   * because the org switcher and per-college branding need it next.
   */
  orgType?: TenantKind;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobilePrimary?: boolean;
}

export function buildNav(ctx: NavContext): NavItem[] {
  const can = (perm: string) => ctx.permissions.includes(perm);

  /** Holds a student's own record — the difference between "my work" and "their work". */
  const isLearner = can('assignment:submit');
  /** Looks after other people's records: trainer, batch manager, mentor, admin. */
  const isStaff = can('student:view');
  /**
   * Belongs to the academy rather than visiting it. A recruiter is the one role
   * from outside — they hold placement:view and nothing else, so any rule
   * written on that permission alone lets a hiring company in.
   */
  const isInsider = can('course:view');

  const items: Array<NavItem & { show: boolean }> = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      show: true,
      mobilePrimary: true,
    },
    {
      href: '/courses',
      label: 'Courses',
      icon: BookOpen,
      show: can('course:view'),
      mobilePrimary: true,
    },
    { href: '/batches', label: 'Batches', icon: Users, show: can('batch:view') },
    {
      href: '/portfolio',
      label: 'Your colleges',
      icon: Building2,
      show: (ctx.orgCount ?? 1) > 1,
    },
    {
      href: '/assignments',
      label: 'Assignments',
      icon: ClipboardList,
      show: isLearner || can('assignment:create'),
      mobilePrimary: true,
    },
    {
      href: '/assessments',
      label: 'Assessments',
      icon: FileCheck2,
      show: isLearner || can('assessment:create'),
    },
    {
      href: '/attendance',
      label: 'Attendance',
      icon: CalendarCheck,
      show: can('attendance:view') || can('attendance:mark'),
    },
    // Live classes: the people who sit in them and the people who run them.
    // A placement officer has no reason to join a lesson.
    {
      href: '/live',
      label: 'Live',
      icon: Radio,
      show: isLearner || can('batch:view'),
      mobilePrimary: true,
    },
    // Own skill profile, or a staff view of somebody's. Placement uses it to shortlist.
    { href: '/skills', label: 'Skills', icon: Sparkles, show: isLearner || isStaff },
    // Career prep is the student's own, and the placement desk's.
    {
      href: '/career',
      label: 'Career',
      icon: Briefcase,
      show: isLearner || can('placement:manage'),
    },
    { href: '/opportunities', label: 'Opportunities', icon: Target, show: can('placement:view') },
    {
      href: '/intelligence',
      label: 'Intelligence',
      icon: BrainCircuit,
      show: isStaff || isLearner,
    },
    // Mentors and the students they mentor. Not the batch desk.
    {
      href: '/mentorship',
      label: 'Mentorship',
      icon: HeartHandshake,
      show: isLearner || can('mentor:manage'),
    },
    // The alumni network: students, alumni themselves, and the placement desk.
    // Deliberately not recruiters — the job board is what they came for, not a
    // directory of your graduates to mine.
    {
      href: '/alumni',
      label: 'Alumni',
      icon: GraduationCap,
      show: (isInsider && can('placement:view')) || can('placement:manage'),
    },
    // Batch managers keep this: batch announcements go out through it.
    { href: '/community', label: 'Community', icon: MessagesSquare, show: can('community:post') },
    { href: '/reports', label: 'Reports', icon: FileBarChart, show: isLearner || isStaff },
    { href: '/insights', label: 'Insights', icon: LineChart, show: can('analytics:view') },
    {
      href: '/admin',
      label: 'Admin',
      icon: ShieldCheck,
      show: can('user:view') || can('feature-flag:manage'),
    },
    { href: '/admin/database', label: 'Database', icon: Database, show: can('database:admin') },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays, show: true, mobilePrimary: true },
    { href: '/profile', label: 'Profile', icon: UserRound, show: true },
  ];

  return items.filter((n) => n.show).map(({ show: _show, ...item }) => item);
}
