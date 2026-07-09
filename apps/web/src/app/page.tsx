'use client';

import Link from 'next/link';

/**
 * Foundation landing page. This is intentionally NOT a mock dashboard — it is a
 * real status page for the platform foundation. Data-backed dashboards (student,
 * trainer, admin) are built on real APIs in Phase 1, reusing the approved design
 * system encoded in the Tailwind preset.
 */
const modules = [
  { name: 'Identity & Auth', status: 'building', phase: 'Phase 0' },
  { name: 'Authorization (RBAC)', status: 'building', phase: 'Phase 0' },
  { name: 'Organizations (multi-tenant)', status: 'building', phase: 'Phase 0' },
  { name: 'Audit & Ops', status: 'building', phase: 'Phase 0' },
  { name: 'Core LMS', status: 'planned', phase: 'Phase 1' },
  { name: 'Student Intelligence', status: 'planned', phase: 'Phase 2' },
  { name: 'Career & Placement', status: 'planned', phase: 'Phase 3' },
  { name: 'Community', status: 'planned', phase: 'Phase 4' },
];

const statusStyles: Record<string, string> = {
  building: 'bg-brand-100 text-brand-600',
  planned: 'bg-soft text-faint',
};

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-gradient-to-br from-brand-400 to-brand-700 shadow-glow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3 3 8l9 5 9-5-9-5Z" fill="#fff" />
              <path
                d="M6 11v4.5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5V11"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-2xl font-extrabold tracking-tight">FutureCorp Academy</span>
          <div className="ml-auto flex gap-2">
            <Link
              href="/login"
              className="rounded-panel px-4 py-2 text-sm font-semibold text-ink transition hover:bg-soft"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-panel bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Get started
            </Link>
          </div>
        </div>

        <h1 className="mt-8 text-3xl font-extrabold tracking-tight">
          Platform foundation is coming online.
        </h1>
        <p className="mt-3 max-w-xl text-faint">
          AI-powered Learning, Student Intelligence, Mentorship, Career, Placement and Community
          Operating System. This page confirms the design system and build pipeline are wired up.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {modules.map((m) => (
            <div
              key={m.name}
              className="rounded-card border border-hair bg-card p-4 shadow-card animate-fadeUp"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{m.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[m.status]}`}
                >
                  {m.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-faint">{m.phase}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3 text-sm">
          <a
            href="http://localhost:4000/api/docs"
            className="rounded-panel bg-brand-500 px-4 py-2 font-semibold text-white transition hover:bg-brand-600"
          >
            API Docs
          </a>
          <a
            href="http://localhost:4000/health/ready"
            className="rounded-panel border border-hair px-4 py-2 font-semibold text-ink transition hover:bg-soft"
          >
            Readiness Check
          </a>
        </div>
      </div>
    </main>
  );
}
