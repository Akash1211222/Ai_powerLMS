'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Briefcase,
  CalendarCheck,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  HeartHandshake,
  LineChart,
  MessagesSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * Public landing page for lms.futurecorpacademy.in.
 *
 * Everything claimed here maps to a capability that actually ships — the page
 * is the first thing a prospective college sees, so it stays in step with the
 * product rather than the roadmap.
 *
 * There is no self-signup: accounts are issued by an academy admin (the API
 * returns 404 for /auth/register by design). Every call to action therefore
 * points at sign-in or at contacting an administrator, never at "create an
 * account".
 */

type Feature = {
  name: string;
  blurb: string;
  icon: LucideIcon;
  grad: string;
};

const aiHighlights: Feature[] = [
  {
    name: 'Assignments that write themselves',
    blurb:
      'Generate language-specific coding tasks from a topic, then let students solve them in an in-browser editor that runs JavaScript, TypeScript, Python, Java, C, C++, SQL and HTML.',
    icon: Sparkles,
    grad: 'bg-grad-brand',
  },
  {
    name: 'Scoring in seconds, not weekends',
    blurb:
      'Submissions are scored against your rubric the moment they land. Low-confidence results are routed to a trainer for review instead of being published blind.',
    icon: FileCheck2,
    grad: 'bg-grad-aqua',
  },
  {
    name: 'Students at risk, spotted early',
    blurb:
      'Attendance, assessment and skill signals combine into an explainable risk score — so you know who is slipping while there is still time to act.',
    icon: BrainCircuit,
    grad: 'bg-grad-sunset',
  },
  {
    name: 'A recovery plan, not just an alert',
    blurb:
      'When risk escalates, the platform opens an intervention and drafts concrete next steps the student can work through and tick off.',
    icon: HeartHandshake,
    grad: 'bg-grad-mint',
  },
];

const features: Feature[] = [
  {
    name: 'Courses & batches',
    blurb: 'Courses, modules and lessons, delivered to batches with enrollments and a shared calendar.',
    icon: BookOpen,
    grad: 'bg-grad-aqua',
  },
  {
    name: 'Assignments',
    blurb: 'Rubric-based tasks with an in-browser code workspace and instant AI scoring.',
    icon: ClipboardList,
    grad: 'bg-grad-brand',
  },
  {
    name: 'Assessments',
    blurb: 'Quizzes and tests with automatic grading, topic breakdowns and per-role result views.',
    icon: FileCheck2,
    grad: 'bg-grad-sunset',
  },
  {
    name: 'Attendance',
    blurb: 'Mark sessions by hand or match attendance straight from a Google Meet, with streaks and trends.',
    icon: CalendarCheck,
    grad: 'bg-grad-mint',
  },
  {
    name: 'Live classes',
    blurb: 'Schedule sessions, share the Meet link and capture who actually attended.',
    icon: Radio,
    grad: 'bg-grad-aqua',
  },
  {
    name: 'Student intelligence',
    blurb: 'Risk scores, skill mastery and explainable insights on every learner.',
    icon: BrainCircuit,
    grad: 'bg-grad-brand',
  },
  {
    name: 'Mentorship',
    blurb: 'A mentor directory with bookable one-to-one sessions and tracked requests.',
    icon: HeartHandshake,
    grad: 'bg-grad-sunset',
  },
  {
    name: 'Placements',
    blurb: 'Post opportunities, track applications and run the college placement pipeline.',
    icon: Briefcase,
    grad: 'bg-grad-mint',
  },
  {
    name: 'Career & skills',
    blurb: 'Skill profiles, personalised recommendations and career paths built from real activity.',
    icon: Target,
    grad: 'bg-grad-aqua',
  },
  {
    name: 'Alumni & community',
    blurb: 'Forums, groups, study rooms and referrals that keep alumni connected to current students.',
    icon: MessagesSquare,
    grad: 'bg-grad-brand',
  },
  {
    name: 'Reports & analytics',
    blurb: 'Batch health, placement readiness and progress reporting for everyone who needs it.',
    icon: LineChart,
    grad: 'bg-grad-sunset',
  },
  {
    name: 'Admin & governance',
    blurb: 'Roles, permissions, feature flags and a full audit trail, enforced on the server.',
    icon: ShieldCheck,
    grad: 'bg-grad-mint',
  },
];

const roles = [
  'Students',
  'Trainers',
  'Batch managers',
  'Mentors',
  'Placement officers',
  'Recruiters',
  'Alumni',
  'College admins',
];

const steps = [
  {
    title: 'Your academy is set up',
    body: 'Your college gets its own tenant. An admin creates accounts and assigns roles — every permission is checked on the server, and one college can never see another’s data.',
  },
  {
    title: 'Teaching runs day to day',
    body: 'Trainers publish courses, open batches, set assignments and record attendance. Students learn, submit work and get scored feedback without waiting.',
  },
  {
    title: 'The platform tells you what changed',
    body: 'Risk scores, skill growth and placement readiness update as work comes in, so intervention and hiring decisions rest on current evidence.',
  },
];

export default function HomePage() {
  const { user, status } = useAuth();
  const signedIn = status === 'authenticated' && Boolean(user);
  const primaryHref = signedIn ? '/dashboard' : '/login';
  const primaryLabel = signedIn ? 'Go to your dashboard' : 'Get started';

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div className="aurora-bg" aria-hidden>
        <div className="blob-3" />
      </div>

      {/* ---------------- Nav ---------------- */}
      <header className="sticky top-0 z-40 border-b border-hair backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-panel bg-grad-holo shadow-glow-aqua">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3 3 8l9 5 9-5-9-5Z" fill="#fff" />
                <path
                  d="M6 11v4.5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5V11"
                  stroke="#fff"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">
              FutureCorp Academy
            </span>
          </Link>

          <div className="ml-auto hidden items-center gap-6 text-sm font-medium text-faint md:flex">
            <a href="#ai" className="transition hover:text-ink">
              AI
            </a>
            <a href="#features" className="transition hover:text-ink">
              Features
            </a>
            <a href="#how" className="transition hover:text-ink">
              How it works
            </a>
          </div>

          <div className="ml-auto flex items-center gap-2 md:ml-6">
            {!signedIn && (
              <Link
                href="/login"
                className="hidden rounded-panel px-3 py-2 text-sm font-semibold text-ink transition hover:bg-chip sm:block"
              >
                Sign in
              </Link>
            )}
            <Link
              href={primaryHref}
              className="rounded-panel bg-grad-brand px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:shadow-glow-pink"
            >
              {signedIn ? 'Dashboard' : 'Get started'}
            </Link>
          </div>
        </nav>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
        <p className="eyebrow">✨ AI-powered learning · intelligence · careers</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          One connected{' '}
          <span className="gradient-text">student intelligence ecosystem</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-faint">
          FutureCorp Academy runs the whole journey — courses and batches, AI-graded
          assignments, attendance, mentorship and placements — and reads the signals
          along the way, so nobody falls behind unnoticed.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href={primaryHref}
            className="group inline-flex items-center gap-2 rounded-panel bg-grad-brand px-6 py-3 text-base font-semibold text-white shadow-glow transition hover:shadow-glow-pink"
          >
            {primaryLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <a
            href="#features"
            className="glass inline-flex items-center rounded-panel px-6 py-3 text-base font-semibold text-ink transition hover:bg-chip"
          >
            Explore the platform
          </a>
        </div>

        <p className="mt-4 text-sm text-faint">
          {signedIn ? (
            <>You’re signed in as {user?.email}.</>
          ) : (
            <>Accounts are issued by your academy — ask your administrator for access.</>
          )}
        </p>

        <dl className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { k: '9 roles', v: 'Every stakeholder gets a dashboard built for their job.' },
            { k: '8 languages', v: 'Run code in the browser — Python, Java, C++, SQL and more.' },
            { k: 'Explainable AI', v: 'Scores and risk always show the reasoning behind them.' },
          ].map((s) => (
            <div key={s.k} className="glass rounded-card p-5 shadow-card">
              <dt className="font-display text-2xl font-bold">
                <span className="gradient-text">{s.k}</span>
              </dt>
              <dd className="mt-1 text-sm text-faint">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- AI ---------------- */}
      <section id="ai" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <p className="eyebrow">Where the AI actually helps</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Not a chatbot bolted on the side.
        </h2>
        <p className="mt-4 max-w-2xl text-faint">
          The AI does the work that used to eat a trainer’s evenings — setting tasks,
          marking them, and noticing the student who has quietly stopped turning up.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {aiHighlights.map((f, i) => {
            const Icon = f.icon;
            return (
              <article
                key={f.name}
                className="glass animate-fadeUp rounded-card p-6 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span
                  className={`mb-4 flex h-11 w-11 items-center justify-center rounded-panel text-white ${f.grad}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="font-display text-lg font-bold">{f.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-faint">{f.blurb}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <p className="eyebrow">Everything in one place</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
          The whole academy, not just the classroom.
        </h2>
        <p className="mt-4 max-w-2xl text-faint">
          Learning, attendance, mentorship, placements and community share one set of
          data — so a student’s progress and their job prospects are never two
          separate stories.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <article
                key={f.name}
                className="glass animate-fadeUp rounded-card p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-panel text-white ${f.grad}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className="font-semibold">{f.name}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-faint">{f.blurb}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------------- Roles ---------------- */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="glass rounded-card p-8 shadow-card sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="eyebrow">Built for everyone on campus</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
                A dashboard that matches your job.
              </h2>
              <p className="mt-4 text-faint">
                Permissions are checked on the server for every request, and each
                college is isolated from the next. People see what their role needs
                and nothing more.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2.5">
              {roles.map((r) => (
                <li
                  key={r}
                  className="rounded-full bg-chip px-4 py-2 text-sm font-medium ring-1 ring-inset ring-hair"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Three steps, then it runs itself.
        </h2>

        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="glass rounded-card p-6 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-panel bg-grad-holo font-display text-lg font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-faint">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-card bg-grad-holo px-8 py-14 text-center shadow-card sm:px-12">
          <GraduationCap
            className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white/10"
            aria-hidden
          />
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready when you are.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            {signedIn
              ? 'Your dashboard is waiting — pick up where you left off.'
              : 'Sign in with the account your academy issued you. Not got one yet? Your college administrator can create it in a minute.'}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={primaryHref}
              className="group inline-flex items-center gap-2 rounded-panel bg-grad-brand px-7 py-3 text-base font-semibold text-white shadow-glow transition hover:shadow-glow-pink"
            >
              {primaryLabel}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            {!signedIn && (
              <Link
                href="/forgot-password"
                className="inline-flex items-center rounded-panel bg-white/10 px-7 py-3 text-base font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20"
              >
                Forgot your password?
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-faint sm:flex-row">
          <span>© {new Date().getFullYear()} FutureCorp Academy</span>
          <div className="flex gap-5">
            <Link href="/login" className="transition hover:text-ink">
              Sign in
            </Link>
            <a href="#features" className="transition hover:text-ink">
              Features
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
