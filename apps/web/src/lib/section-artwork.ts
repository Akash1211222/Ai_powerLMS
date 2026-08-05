export type SectionArtKey =
  | 'dashboard'
  | 'courses'
  | 'batches'
  | 'assignments'
  | 'assessments'
  | 'attendance'
  | 'live'
  | 'skills'
  | 'career'
  | 'opportunities'
  | 'intelligence'
  | 'mentorship'
  | 'alumni'
  | 'community'
  | 'reports'
  | 'insights'
  | 'admin'
  | 'calendar';

export interface SectionArt {
  key: SectionArtKey;
  src: string;
  alt: string;
  eyebrow: string;
  title: string;
  blurb: string;
}

export const SECTION_ART: Record<SectionArtKey, SectionArt> = {
  dashboard: {
    key: 'dashboard',
    src: '/artwork/mascot-dashboard.png',
    alt: 'Fox mascot with holographic dashboard',
    eyebrow: 'Mission control',
    title: 'Your day, at a glance',
    blurb: 'Courses, deadlines, and live sessions — one friendly cockpit.',
  },
  courses: {
    key: 'courses',
    src: '/artwork/mascot-courses.png',
    alt: 'Owl mascot reading a glowing book',
    eyebrow: 'Learn',
    title: 'Dive into your courses',
    blurb: 'Lessons, videos, and modules ready when you are.',
  },
  batches: {
    key: 'batches',
    src: '/artwork/mascot-batches.png',
    alt: 'Fox pack mascot for cohort batches',
    eyebrow: 'Cohorts',
    title: 'Your learning crew',
    blurb: 'Batches, trainers, and classmates moving together.',
  },
  assignments: {
    key: 'assignments',
    src: '/artwork/mascot-assignments.png',
    alt: 'Fox coding on a laptop',
    eyebrow: 'Build',
    title: 'Ship the next lab',
    blurb: 'AI-matched coding tasks with an in-browser emulator.',
  },
  assessments: {
    key: 'assessments',
    src: '/artwork/mascot-assessments.png',
    alt: 'Owl holding a quiz clipboard',
    eyebrow: 'Prove it',
    title: 'Quizzes that sharpen you',
    blurb: 'Timed assessments with topic-level feedback.',
  },
  attendance: {
    key: 'attendance',
    src: '/artwork/mascot-attendance.png',
    alt: 'Fox mascot with streak flame',
    eyebrow: 'Show up',
    title: 'Keep the streak fox proud',
    blurb: 'Presence, punctuality, and the flame that grows with you.',
  },
  live: {
    key: 'live',
    src: '/artwork/mascot-live.png',
    alt: 'Fox with headset for live class',
    eyebrow: 'Go live',
    title: 'Class is in session',
    blurb: 'Join Meet, earn watch-time attendance, stay connected.',
  },
  skills: {
    key: 'skills',
    src: '/artwork/mascot-skills.png',
    alt: 'Fox juggling skill badges',
    eyebrow: 'Level up',
    title: 'Skills academy',
    blurb: 'Code lab, challenges, articles, and soft-skill drills — practice that compounds.',
  },
  career: {
    key: 'career',
    src: '/artwork/mascot-career.png',
    alt: 'Fox in blazer with briefcase',
    eyebrow: 'Path',
    title: 'Career cockpit',
    blurb: 'Story, projects, timeline, and placement readiness — built to get interviews.',
  },
  opportunities: {
    key: 'opportunities',
    src: '/artwork/mascot-opportunities.png',
    alt: 'Fox with target and compass',
    eyebrow: 'Radar',
    title: 'Opportunity mission control',
    blurb: 'Match radar, application pipeline, and network referrals — roles that fit your signal.',
  },
  intelligence: {
    key: 'intelligence',
    src: '/artwork/mascot-intelligence.png',
    alt: 'Owl with holographic brain analytics',
    eyebrow: 'Constellation',
    title: 'Signal intelligence',
    blurb: 'Gemini-coached reports with explainable risk pillars, focus plans, and cohort briefings — the edge of this LMS.',
  },
  mentorship: {
    key: 'mentorship',
    src: '/artwork/mascot-mentorship.png',
    alt: 'Fox mentors handshake',
    eyebrow: 'Lounge',
    title: 'Mentorship lounge',
    blurb: 'Book slots — or request a topic and let a mentor arrange a Meet call when they’re free.',
  },
  alumni: {
    key: 'alumni',
    src: '/artwork/mascot-alumni.png',
    alt: 'Graduating fox with diploma',
    eyebrow: 'Legacy',
    title: 'Alumni network',
    blurb: 'Outcomes, stories, and doors opened by grads.',
  },
  community: {
    key: 'community',
    src: '/artwork/mascot-community.png',
    alt: 'Fox with chat bubbles',
    eyebrow: 'Talk',
    title: 'Ask, answer, belong',
    blurb: 'Questions, votes, and peer learning in one place.',
  },
  reports: {
    key: 'reports',
    src: '/artwork/mascot-reports.png',
    alt: 'Fox presenting charts',
    eyebrow: 'Story',
    title: 'Progress reports',
    blurb: 'Weekly narratives trainers and you can act on.',
  },
  insights: {
    key: 'insights',
    src: '/artwork/mascot-insights.png',
    alt: 'Fox pointing at rising graph',
    eyebrow: 'Trends',
    title: 'Org insights',
    blurb: 'Batch health, placement pulse, and what to fix next.',
  },
  admin: {
    key: 'admin',
    src: '/artwork/mascot-admin.png',
    alt: 'Fox with shield and key',
    eyebrow: 'Control',
    title: 'Admin console',
    blurb: 'Users, flags, and the keys that keep the academy safe.',
  },
  calendar: {
    key: 'calendar',
    src: '/artwork/mascot-calendar.png',
    alt: 'Fox holding a calendar',
    eyebrow: 'Plan',
    title: 'What’s coming up',
    blurb: 'Sessions, deadlines, and live classes on one timeline.',
  },
};

/** Map a pathname to a section art key (first matching segment). */
export function sectionArtFromPath(pathname: string): SectionArt | null {
  const map: Array<{ prefix: string; key: SectionArtKey }> = [
    { prefix: '/dashboard', key: 'dashboard' },
    { prefix: '/courses', key: 'courses' },
    { prefix: '/batches', key: 'batches' },
    { prefix: '/assignments', key: 'assignments' },
    { prefix: '/assessments', key: 'assessments' },
    { prefix: '/attendance', key: 'attendance' },
    { prefix: '/live', key: 'live' },
    { prefix: '/skills', key: 'skills' },
    { prefix: '/career', key: 'career' },
    { prefix: '/opportunities', key: 'opportunities' },
    { prefix: '/placements', key: 'opportunities' },
    { prefix: '/intelligence', key: 'intelligence' },
    { prefix: '/mentorship', key: 'mentorship' },
    { prefix: '/mentors', key: 'mentorship' },
    { prefix: '/alumni', key: 'alumni' },
    { prefix: '/community', key: 'community' },
    { prefix: '/reports', key: 'reports' },
    { prefix: '/insights', key: 'insights' },
    { prefix: '/admin', key: 'admin' },
    { prefix: '/calendar', key: 'calendar' },
  ];
  const hit = map.find((m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`));
  return hit ? SECTION_ART[hit.key] : null;
}
