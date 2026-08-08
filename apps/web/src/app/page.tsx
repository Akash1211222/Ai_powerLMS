'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Briefcase,
  CalendarCheck,
  ClipboardList,
  FileCheck2,
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
 * Two visual registers, deliberately fused: a "HUD / Sci-Fi FUI" wireframe
 * system (grid, scan sweeps, fine-line glow) carrying the platform's own 3D
 * character renders. Only the artwork from the dark, cinematic half of
 * /public/artwork is used — the pastel clay pieces (career-hub) belong to a
 * different lighting register and would read as a mismatch here.
 *
 * Everything claimed maps to a capability that ships. There is no self-signup —
 * accounts are issued by an academy admin and the API 404s /auth/register — so
 * no call to action offers one.
 */

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

/** 44×44 minimum touch target for the compact nav/footer links. */
const tapTarget = 'inline-flex min-h-[44px] items-center';

/**
 * Reveals sections as they enter the viewport.
 *
 * IntersectionObserver rather than a scroll library — the effect is one class
 * toggle. `lp-js` gates the hidden state so content is never stranded
 * invisible if this never runs.
 */
function useScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.lp-reveal'));

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }

    root.classList.add('lp-js');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    targets.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      root.classList.remove('lp-js');
    };
  }, []);
}

type Item = { name: string; blurb: string; icon: LucideIcon; grad: string };

const aiBento: Item[] = [
  {
    name: 'Assignments that write themselves',
    blurb:
      'Generate language-specific coding tasks from a topic, then let students solve them in an in-browser editor that runs JavaScript, TypeScript, Python, Java, C, C++, SQL and HTML.',
    icon: Sparkles,
    grad: 'bg-grad-brand',
  },
  {
    name: 'Scoring in seconds',
    blurb:
      'Work is marked against your rubric the moment it lands. Low-confidence results go to a trainer instead of being published blind.',
    icon: FileCheck2,
    grad: 'bg-grad-aqua',
  },
  {
    name: 'Risk, spotted early',
    blurb:
      'Attendance, assessment and skill signals combine into a risk score that always shows its reasoning.',
    icon: BrainCircuit,
    grad: 'bg-grad-sunset',
  },
  {
    name: 'A plan, not just an alert',
    blurb:
      'When risk escalates the platform opens an intervention and drafts concrete steps the student can tick off.',
    icon: HeartHandshake,
    grad: 'bg-grad-mint',
  },
];

/** Character-led showcase — one render per pillar of the product. */
const showcase = [
  {
    src: '/artwork/courses-hub-hero.png',
    alt: 'A student at a futuristic desk studying with holographic lesson panels and an AI tutor',
    eyebrow: 'Learn',
    title: 'Courses that keep pace',
    blurb:
      'Modules, lessons and batches with a code workspace built in — so practice happens where the teaching does.',
  },
  {
    src: '/artwork/mentorship-hub-hero.png',
    alt: 'A mentor and a student shaking hands in front of a holographic session calendar',
    eyebrow: 'Grow',
    title: 'Mentors on the calendar',
    blurb:
      'A directory of mentors with bookable one-to-one slots, tracked requests and session history.',
  },
  {
    src: '/artwork/opportunities-hub-hero.png',
    alt: 'A placement officer reviewing candidate profiles on a holographic radar console',
    eyebrow: 'Get hired',
    title: 'Placements, end to end',
    blurb:
      'Post opportunities, track every application and see which students are actually ready.',
  },
];

const features: Item[] = [
  {
    name: 'Courses & batches',
    blurb: 'Courses, modules and lessons delivered to batches, with enrollments and a shared calendar.',
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
    blurb: 'Quizzes and tests with automatic grading and topic-level breakdowns.',
    icon: FileCheck2,
    grad: 'bg-grad-sunset',
  },
  {
    name: 'Attendance',
    blurb: 'Mark sessions by hand or match attendance straight from a Google Meet.',
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
    blurb: 'Post opportunities, track applications and run the placement pipeline.',
    icon: Briefcase,
    grad: 'bg-grad-mint',
  },
  {
    name: 'Career & skills',
    blurb: 'Skill profiles, recommendations and career paths built from real activity.',
    icon: Target,
    grad: 'bg-grad-aqua',
  },
  {
    name: 'Alumni & community',
    blurb: 'Forums, groups, study rooms and referrals that keep alumni close to students.',
    icon: MessagesSquare,
    grad: 'bg-grad-brand',
  },
  {
    name: 'Reports & analytics',
    blurb: 'Batch health, placement readiness and progress reporting.',
    icon: LineChart,
    grad: 'bg-grad-sunset',
  },
  {
    name: 'Admin & governance',
    blurb: 'Roles, permissions, feature flags and a full audit trail, enforced server-side.',
    icon: ShieldCheck,
    grad: 'bg-grad-mint',
  },
];

const ticker = [
  'AI-graded assignments',
  'Google Meet attendance',
  'Explainable risk scores',
  'In-browser code runner',
  'Recovery plans',
  'Placement pipeline',
  'Mentor booking',
  'Skill mastery tracking',
  'Batch analytics',
  'Community & alumni',
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
    body: 'Your college gets its own tenant. An admin creates accounts and assigns roles — permissions are checked on the server, and one college can never see another’s data.',
  },
  {
    title: 'Teaching runs day to day',
    body: 'Trainers publish courses, open batches, set assignments and record attendance. Students submit work and get scored feedback without waiting.',
  },
  {
    title: 'The platform tells you what changed',
    body: 'Risk, skill growth and placement readiness update as work comes in, so decisions rest on current evidence.',
  },
];

export default function HomePage() {
  const { user, status } = useAuth();
  useScrollReveal();

  const signedIn = status === 'authenticated' && Boolean(user);
  const primaryHref = signedIn ? '/dashboard' : '/login';
  const primaryLabel = signedIn ? 'Go to your dashboard' : 'Get started';

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div className="aurora-bg" aria-hidden>
        <div className="blob-3" />
      </div>

      {/* ---------------- Nav ---------------- */}
      <header className="sticky top-0 z-40 border-b border-hair bg-bg/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <Link href="/" className={`flex min-h-[44px] items-center gap-2.5 rounded-panel ${focusRing}`}>
            <Image
              src="/brand/futurecorp-mark.png"
              alt="FutureCorp Academy"
              width={40}
              height={37}
              priority
              className="h-9 w-auto object-contain drop-shadow-[0_4px_12px_rgba(37,99,235,0.4)]"
            />
            <span className="flex flex-col leading-none">
              <span className="font-display text-base font-extrabold tracking-tight">FutureCorp</span>
              <span className="text-[9px] font-bold tracking-[0.34em] text-faint">ACADEMY</span>
            </span>
          </Link>

          <div className="ml-auto hidden items-center gap-7 text-sm font-medium text-faint lg:flex">
            <a href="#ai" className={`${tapTarget} rounded transition-colors duration-200 hover:text-ink ${focusRing}`}>
              AI
            </a>
            <a href="#platform" className={`${tapTarget} rounded transition-colors duration-200 hover:text-ink ${focusRing}`}>
              Platform
            </a>
            <a href="#features" className={`${tapTarget} rounded transition-colors duration-200 hover:text-ink ${focusRing}`}>
              Features
            </a>
            <a href="#how" className={`${tapTarget} rounded transition-colors duration-200 hover:text-ink ${focusRing}`}>
              How it works
            </a>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:ml-7">
            {!signedIn && (
              <Link
                href="/login"
                className={`hidden cursor-pointer rounded-panel px-3 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-chip sm:inline-flex ${tapTarget} ${focusRing}`}
              >
                Sign in
              </Link>
            )}
            <Link
              href={primaryHref}
              className={`${tapTarget} cursor-pointer rounded-panel bg-grad-brand px-4 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:shadow-glow-pink active:scale-[0.97] ${focusRing}`}
            >
              {signedIn ? 'Dashboard' : 'Get started'}
            </Link>
          </div>
        </nav>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pt-24">
        <div className="lp-grid" aria-hidden />
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              AI-powered learning · intelligence · careers
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
              One connected{' '}
              <span className="gradient-text">student intelligence ecosystem</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-faint">
              FutureCorp Academy runs the whole journey — courses and batches, AI-graded
              assignments, attendance, mentorship and placements — and reads the signals
              along the way, so nobody falls behind unnoticed.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href={primaryHref}
                className={`group inline-flex cursor-pointer items-center gap-2 rounded-panel bg-grad-brand px-6 py-3 text-base font-semibold text-white shadow-glow transition-all duration-200 hover:shadow-glow-pink active:scale-[0.97] ${focusRing}`}
              >
                {primaryLabel}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
              <a
                href="#platform"
                className={`glass inline-flex cursor-pointer items-center rounded-panel px-6 py-3 text-base font-semibold text-ink transition-all duration-200 hover:bg-chip active:scale-[0.97] ${focusRing}`}
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
          </div>

          {/* Character render, framed as a HUD panel, with the brand mark
              docked to the corner so identity and warmth sit together. */}
          <div className="relative">
            <div className="lp-art-bloom" aria-hidden />
            <div className="lp-art lp-art-bare aspect-[3/2] w-full shadow-card">
              <Image
                src="/artwork/skills-hub-hero.png"
                alt="Two FutureCorp Academy characters — a fox coding on a laptop and an owl reading — around a holographic skill display"
                width={1536}
                height={1024}
                priority
                sizes="(max-width: 1024px) 92vw, 46vw"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-5 -left-5 hidden h-20 w-20 place-items-center rounded-card bg-bg/80 p-3 shadow-card backdrop-blur-md sm:grid">
              <Image
                src="/brand/futurecorp-mark.png"
                alt=""
                width={64}
                height={59}
                aria-hidden
                className="h-full w-auto object-contain drop-shadow-[0_4px_12px_rgba(37,99,235,0.45)]"
              />
            </div>
          </div>
        </div>

        <dl className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { k: '9 roles', v: 'Every stakeholder gets a dashboard built for their job.' },
            { k: '8 languages', v: 'Run code in the browser — Python, Java, C++, SQL and more.' },
            { k: 'Explainable AI', v: 'Scores and risk always show the reasoning behind them.' },
          ].map((s, i) => (
            <div
              key={s.k}
              className="lp-reveal lp-hud glass rounded-card p-5 shadow-card"
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <dt className="font-display text-2xl font-bold">
                <span className="gradient-text">{s.k}</span>
              </dt>
              <dd className="mt-1 text-sm text-faint">{s.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- Capability ticker ---------------- */}
      <section className="border-y border-hair py-4" aria-hidden>
        <div className="lp-ticker-mask overflow-hidden">
          <div className="lp-ticker gap-8 pr-8">
            {/* Duplicated so the -50% marquee loop is seamless. */}
            {[...ticker, ...ticker].map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="flex shrink-0 items-center gap-2 text-sm font-medium text-faint"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-grad-brand" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- AI ---------------- */}
      <section id="ai" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="lp-reveal grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative order-2 lg:order-1">
            <div className="lp-art-bloom" aria-hidden />
            <div className="lp-art lp-art-bare aspect-[3/2] w-full shadow-card">
              <Image
                src="/artwork/intelligence-hub-hero.png"
                alt="An owl in a scholar's coat presenting a glowing neural network of student signals beside analytics dashboards"
                width={1536}
                height={1024}
                loading="lazy"
                sizes="(max-width: 1024px) 92vw, 42vw"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="eyebrow">Where the AI actually helps</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Not a chatbot bolted on the side.
            </h2>
            <p className="mt-4 text-faint">
              The AI does the work that used to eat a trainer’s evenings — setting tasks,
              marking them, and noticing the student who has quietly stopped turning up.
            </p>
          </div>
        </div>

        {/* Bento: the lead capability holds column 1 across both rows. */}
        <div className="mt-12 grid gap-4 md:grid-cols-3 md:grid-rows-2">
          {aiBento.map((f, i) => {
            const Icon = f.icon;
            const lead = i === 0;
            const wide = i === aiBento.length - 1;
            return (
              <article
                key={f.name}
                style={{ transitionDelay: `${i * 80}ms` }}
                className={`lp-reveal lp-holo lp-hud glass rounded-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover ${
                  lead ? 'p-7 md:row-span-2 md:flex md:flex-col md:justify-center' : 'p-6'
                } ${wide ? 'md:col-span-2' : ''}`}
              >
                <span
                  className={`mb-4 flex items-center justify-center rounded-panel text-white ${f.grad} ${
                    lead ? 'h-14 w-14' : 'h-11 w-11'
                  }`}
                >
                  <Icon className={lead ? 'h-7 w-7' : 'h-5 w-5'} aria-hidden />
                </span>
                <h3 className={`font-display font-bold ${lead ? 'text-2xl' : 'text-lg'}`}>
                  {f.name}
                </h3>
                <p className={`mt-2 leading-relaxed text-faint ${lead ? 'text-base' : 'text-sm'}`}>
                  {f.blurb}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------------- Character showcase ---------------- */}
      <section id="platform" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="lp-reveal">
          <p className="eyebrow">The journey, end to end</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            From first lesson to first offer.
          </h2>
          <p className="mt-4 max-w-2xl text-faint">
            Learning, mentorship and placement are one continuous track here, not three
            products bolted together.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {showcase.map((s, i) => (
            <article
              key={s.title}
              style={{ transitionDelay: `${i * 90}ms` }}
              className="lp-reveal group overflow-hidden rounded-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
            >
              <div className="lp-art relative aspect-[4/3] w-full">
                <Image
                  src={s.src}
                  alt={s.alt}
                  width={1536}
                  height={1024}
                  loading="lazy"
                  sizes="(max-width: 768px) 92vw, 31vw"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-3 left-4 z-[3] text-xs font-bold uppercase tracking-[0.22em] text-white/90">
                  {s.eyebrow}
                </span>
              </div>
              <div className="glass rounded-b-card p-5">
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-faint">{s.blurb}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="relative mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="lp-grid" aria-hidden />
        <div className="lp-reveal">
          <p className="eyebrow">Everything in one place</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            The whole academy, not just the classroom.
          </h2>
          <p className="mt-4 max-w-2xl text-faint">
            Learning, attendance, mentorship, placements and community share one set of
            data — so a student’s progress and their job prospects are never two separate
            stories.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <article
                key={f.name}
                style={{ transitionDelay: `${(i % 3) * 70}ms` }}
                className="lp-reveal lp-holo group glass rounded-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-panel text-white transition-transform duration-300 group-hover:scale-110 ${f.grad}`}
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
        <div className="lp-reveal lp-hud glass rounded-card p-8 shadow-card sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="eyebrow">Built for everyone on campus</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
                A dashboard that matches your job.
              </h2>
              <p className="mt-4 text-faint">
                Permissions are checked on the server for every request, and each college
                is isolated from the next. People see what their role needs, nothing more.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2.5">
              {roles.map((r) => (
                <li
                  key={r}
                  className="rounded-full bg-chip px-4 py-2 text-sm font-medium ring-1 ring-inset ring-hair transition-transform duration-200 hover:-translate-y-0.5"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="lp-reveal">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps, then it runs itself.
          </h2>
        </div>

        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              style={{ transitionDelay: `${i * 90}ms` }}
              className="lp-reveal lp-hud glass rounded-card p-6 shadow-card"
            >
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
        <div className="lp-reveal relative overflow-hidden rounded-card bg-grad-holo px-8 py-14 text-center shadow-card sm:px-12">
          <Image
            src="/brand/futurecorp-mark.png"
            alt=""
            width={300}
            height={276}
            aria-hidden
            loading="lazy"
            className="pointer-events-none absolute -right-10 -top-10 w-48 opacity-[0.13] sm:w-64"
          />
          <h2 className="relative font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready when you are.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-white/85">
            {signedIn
              ? 'Your dashboard is waiting — pick up where you left off.'
              : 'Sign in with the account your academy issued you. Not got one yet? Your college administrator can create it in a minute.'}
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={primaryHref}
              className={`group inline-flex cursor-pointer items-center gap-2 rounded-panel bg-grad-brand px-7 py-3 text-base font-semibold text-white shadow-glow transition-all duration-200 hover:shadow-glow-pink active:scale-[0.97] focus-visible:ring-offset-brand-900 ${focusRing}`}
            >
              {primaryLabel}
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            {!signedIn && (
              <Link
                href="/forgot-password"
                className={`inline-flex cursor-pointer items-center rounded-panel bg-white/10 px-7 py-3 text-base font-semibold text-white ring-1 ring-inset ring-white/25 transition-all duration-200 hover:bg-white/20 active:scale-[0.97] focus-visible:ring-offset-brand-900 ${focusRing}`}
              >
                Forgot your password?
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-hair">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-faint sm:flex-row">
          <div className="flex items-center gap-2.5">
            <Image
              src="/brand/futurecorp-mark.png"
              alt=""
              width={28}
              height={26}
              aria-hidden
              loading="lazy"
              className="h-6 w-auto object-contain opacity-80"
            />
            <span>© {new Date().getFullYear()} FutureCorp Academy</span>
          </div>
          <div className="flex gap-5">
            <Link href="/login" className={`${tapTarget} rounded transition-colors duration-200 hover:text-ink ${focusRing}`}>
              Sign in
            </Link>
            <a href="#features" className={`${tapTarget} rounded transition-colors duration-200 hover:text-ink ${focusRing}`}>
              Features
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
