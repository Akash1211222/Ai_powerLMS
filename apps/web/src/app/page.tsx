'use client';

import Link from 'next/link';
import {
  ShieldCheck,
  KeyRound,
  Building2,
  ScrollText,
  BookOpen,
  Sparkles,
  Briefcase,
  BrainCircuit,
  HeartHandshake,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';

/**
 * Landing page — holographic glass hero over the aurora backdrop, with the
 * live module map as colorful glass tiles.
 */
const modules: Array<{ name: string; status: string; phase: string; icon: LucideIcon }> = [
  { name: 'Identity & Auth', status: 'live', phase: 'Phase 0', icon: KeyRound },
  { name: 'Authorization (RBAC)', status: 'live', phase: 'Phase 0', icon: ShieldCheck },
  { name: 'Organizations (multi-tenant)', status: 'live', phase: 'Phase 0', icon: Building2 },
  { name: 'Audit & Ops', status: 'live', phase: 'Phase 0', icon: ScrollText },
  { name: 'Core LMS', status: 'live', phase: 'Phase 1', icon: BookOpen },
  { name: 'AI Assignments & Assessments', status: 'live', phase: 'Phase 1', icon: Sparkles },
  { name: 'Career & Placement', status: 'live', phase: 'Phase 2', icon: Briefcase },
  { name: 'Student Intelligence', status: 'live', phase: 'Phase 3', icon: BrainCircuit },
  { name: 'Mentorship', status: 'live', phase: 'Phase 4', icon: HeartHandshake },
  { name: 'Community', status: 'live', phase: 'Phase 4', icon: MessagesSquare },
];

const statusStyles: Record<string, string> = {
  live: 'bg-success/15 text-success ring-1 ring-inset ring-success/25',
  building: 'bg-brand-100 text-brand-600 ring-1 ring-inset ring-brand-200',
  planned: 'bg-soft text-faint ring-1 ring-inset ring-hair',
};

const iconGrads = ['bg-grad-brand', 'bg-grad-aqua', 'bg-grad-sunset', 'bg-grad-mint'];

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="aurora-bg" aria-hidden>
        <div className="blob-3" />
      </div>
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-panel bg-grad-holo shadow-glow">
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
          <span className="font-display text-2xl font-extrabold tracking-tight">
            FutureCorp Academy
          </span>
          <div className="ml-auto flex gap-2">
            <Link
              href="/login"
              className="glass rounded-panel px-4 py-2 text-sm font-semibold text-ink transition hover:bg-chip"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-panel bg-grad-brand px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:shadow-glow-pink"
            >
              Get started
            </Link>
          </div>
        </div>

        <p className="eyebrow mt-12">✨ Practical Skills · Real Projects · Career Readiness</p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          The <span className="gradient-text">AI-powered campus OS</span> for colleges, trainers,
          students &amp; placement.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-faint">
          Courses, batches, AI-graded assignments, assessments, attendance, mentorship and a
          placement pipeline — with role-aware dashboards for every stakeholder.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {modules.map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={m.name}
                className="glass animate-fadeUp rounded-card p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-panel text-white ${iconGrads[i % iconGrads.length]}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{m.name}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[m.status]}`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-faint">{m.phase}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex flex-wrap gap-3 text-sm">
          <a
            href="http://localhost:4000/api/docs"
            className="rounded-panel bg-grad-aqua px-4 py-2 font-semibold text-white shadow-glow-aqua transition hover:-translate-y-px"
          >
            API Docs
          </a>
          <a
            href="http://localhost:4000/health/ready"
            className="glass rounded-panel px-4 py-2 font-semibold text-ink transition hover:bg-chip"
          >
            Readiness Check
          </a>
        </div>
      </div>
    </main>
  );
}
