import type { LucideIcon } from 'lucide-react';
import {
  Award,
  Bell,
  BookOpen,
  Briefcase,
  CalendarCheck,
  ClipboardList,
  FileCheck2,
  Flame,
  GraduationCap,
  Handshake,
  HeartHandshake,
  LineChart,
  MessagesSquare,
  Radio,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';

export interface NotificationTypeMeta {
  label: string;
  icon: LucideIcon;
  accent: string; // tailwind bg class for icon chip
  ring: string;
}

const META: Record<string, NotificationTypeMeta> = {
  LIVE_CLASS_SCHEDULED: { label: 'Live class', icon: Radio, accent: 'bg-grad-holo', ring: 'ring-brand-400/40' },
  CLASS_REMINDER: { label: 'Class reminder', icon: Bell, accent: 'bg-grad-aqua', ring: 'ring-sky-400/40' },
  ATTENDANCE_REPORT: { label: 'Attendance', icon: CalendarCheck, accent: 'bg-grad-mint', ring: 'ring-emerald-400/40' },
  STREAK_MILESTONE: { label: 'Streak', icon: Flame, accent: 'bg-grad-sunset', ring: 'ring-accent-400/40' },
  ATTENDANCE_CORRECTION: { label: 'Attendance', icon: CalendarCheck, accent: 'bg-grad-mint', ring: 'ring-emerald-400/40' },
  ASSIGNMENT_PUBLISHED: { label: 'Assignment', icon: ClipboardList, accent: 'bg-grad-holo', ring: 'ring-brand-400/40' },
  ASSIGNMENT_DEADLINE: { label: 'Deadline', icon: ClipboardList, accent: 'bg-grad-sunset', ring: 'ring-accent-400/40' },
  ASSIGNMENT_EVALUATED: { label: 'Graded', icon: FileCheck2, accent: 'bg-grad-mint', ring: 'ring-emerald-400/40' },
  ASSESSMENT_PUBLISHED: { label: 'Assessment', icon: BookOpen, accent: 'bg-grad-aqua', ring: 'ring-sky-400/40' },
  ENROLLMENT: { label: 'Enrollment', icon: GraduationCap, accent: 'bg-grad-holo', ring: 'ring-brand-400/40' },
  MENTOR_BOOKING: { label: 'Mentorship', icon: Handshake, accent: 'bg-grad-aqua', ring: 'ring-sky-400/40' },
  MENTOR_REQUEST: { label: 'Mentor help', icon: HeartHandshake, accent: 'bg-grad-sunset', ring: 'ring-accent-400/40' },
  PLACEMENT_OPPORTUNITY: { label: 'Opportunity', icon: Briefcase, accent: 'bg-grad-holo', ring: 'ring-brand-400/40' },
  APPLICATION_UPDATE: { label: 'Application', icon: Briefcase, accent: 'bg-grad-mint', ring: 'ring-emerald-400/40' },
  RISK_INTERVENTION: { label: 'Intelligence', icon: ShieldAlert, accent: 'bg-grad-sunset', ring: 'ring-accent-400/40' },
  RECOVERY_TASK: { label: 'Focus task', icon: Sparkles, accent: 'bg-grad-aqua', ring: 'ring-sky-400/40' },
  PROGRESS_REPORT: { label: 'Report', icon: LineChart, accent: 'bg-grad-holo', ring: 'ring-brand-400/40' },
  ACHIEVEMENT: { label: 'Achievement', icon: Award, accent: 'bg-grad-sunset', ring: 'ring-accent-400/40' },
  GENERAL: { label: 'Update', icon: Users, accent: 'bg-grad-mint', ring: 'ring-emerald-400/40' },
  COMMUNITY_POST_COMMENT: { label: 'Community', icon: MessagesSquare, accent: 'bg-grad-holo', ring: 'ring-brand-400/40' },
  COMMUNITY_MESSAGE: { label: 'Message', icon: MessagesSquare, accent: 'bg-grad-aqua', ring: 'ring-sky-400/40' },
  COMMUNITY_GROUP_INVITE: { label: 'Group', icon: Users, accent: 'bg-grad-mint', ring: 'ring-emerald-400/40' },
  COMMUNITY_EVENT_REMINDER: { label: 'Event', icon: CalendarCheck, accent: 'bg-grad-sunset', ring: 'ring-accent-400/40' },
};

export function notificationMeta(type: string): NotificationTypeMeta {
  return META[type] ?? { label: 'Signal', icon: Bell, accent: 'bg-grad-holo', ring: 'ring-brand-400/40' };
}

/** Resolve where a notification should navigate — prefer server deepLink, else type fallback. */
export function resolveNotificationHref(type: string, deepLink: string | null | undefined): string {
  if (deepLink && deepLink.startsWith('/')) return deepLink;

  switch (type) {
    case 'ASSIGNMENT_PUBLISHED':
    case 'ASSIGNMENT_DEADLINE':
    case 'ASSIGNMENT_EVALUATED':
      return '/assignments';
    case 'ASSESSMENT_PUBLISHED':
      return '/assessments';
    case 'LIVE_CLASS_SCHEDULED':
    case 'CLASS_REMINDER':
    case 'ATTENDANCE_REPORT':
      return '/live';
    case 'ATTENDANCE_CORRECTION':
    case 'STREAK_MILESTONE':
      return '/attendance';
    case 'MENTOR_BOOKING':
      return '/mentors';
    case 'MENTOR_REQUEST':
      return '/mentorship';
    case 'PLACEMENT_OPPORTUNITY':
    case 'APPLICATION_UPDATE':
      return '/opportunities';
    case 'RISK_INTERVENTION':
    case 'RECOVERY_TASK':
      return '/intelligence';
    case 'PROGRESS_REPORT':
      return '/reports';
    case 'ACHIEVEMENT':
    case 'GENERAL':
    case 'COMMUNITY_POST_COMMENT':
    case 'COMMUNITY_MESSAGE':
    case 'COMMUNITY_GROUP_INVITE':
    case 'COMMUNITY_EVENT_REMINDER':
      return '/community';
    case 'ENROLLMENT':
      return '/courses';
    default:
      return '/dashboard';
  }
}

export function relativeWhen(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
