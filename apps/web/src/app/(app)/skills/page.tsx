'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  Code2,
  BookOpen,
  MessageSquare,
  Target,
  Flame,
  Lightbulb,
  Trophy,
  Play,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Card, Badge, Spinner, Alert, Button, Select, cn } from '@fca/ui';
import { skillsApi, type StudentSkill } from '@/lib/skills-api';
import { scoresApi } from '@/lib/scores-api';
import {
  CODING_CHALLENGES,
  SKILL_ARTICLES,
  SOFT_DRILLS,
  type CodingChallenge,
  type SkillArticle,
} from '@/lib/skills-practice';
import type { CodeLanguage, RunCodeResult } from '@/lib/lms-learning-api';
import { DashboardHero, HeroPanel, todayLabel } from '@/components/dashboard-hero';
import { CodeWorkspace } from '@/components/code-workspace';
import { SectionArtworkPanel } from '@/components/section-artwork';
import { RadialGauge } from '@/components/charts';

type Tab = 'overview' | 'lab' | 'challenges' | 'learn' | 'soft';

const trendIcon: Record<string, string> = { UP: '▲', DOWN: '▼', FLAT: '▬', NEW: '✦' };

const LAB_LANGS: Array<{ value: Exclude<CodeLanguage, 'NONE'>; label: string }> = [
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'TYPESCRIPT', label: 'TypeScript' },
  { value: 'PYTHON', label: 'Python' },
  { value: 'JAVA', label: 'Java' },
  { value: 'CPP', label: 'C++' },
  { value: 'C', label: 'C' },
  { value: 'SQL', label: 'SQL' },
  { value: 'WEB', label: 'Web (HTML/CSS/JS)' },
];

const STARTERS: Record<Exclude<CodeLanguage, 'NONE'>, string> = {
  JAVASCRIPT: `// Skills Lab — free practice
function hello(name) {
  return \`Hello, \${name}!\`;
}
console.log(hello('FutureCorp'));
`,
  TYPESCRIPT: `function hello(name: string): string {
  return \`Hello, \${name}!\`;
}
console.log(hello('FutureCorp'));
`,
  PYTHON: `# Skills Lab — free practice
def hello(name: str) -> str:
    return f"Hello, {name}!"

print(hello("FutureCorp"))
`,
  JAVA: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, FutureCorp!");
  }
}
`,
  C: `#include <stdio.h>
int main(void) {
  printf("Hello, FutureCorp!\\n");
  return 0;
}
`,
  CPP: `#include <iostream>
using namespace std;
int main() {
  cout << "Hello, FutureCorp!" << endl;
  return 0;
}
`,
  SQL: `-- Skills Lab
SELECT 'Hello, FutureCorp!' AS greeting;
`,
  WEB: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: system-ui; padding: 2rem; background: #f4f7fb; }
    h1 { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Skills Lab</h1>
  <p>Edit me and click Run.</p>
</body>
</html>
`,
};

export default function SkillsPage() {
  const skillsQ = useQuery({ queryKey: ['me', 'skills'], queryFn: skillsApi.mine });
  const scoreQ = useQuery({ queryKey: ['me', 'score'], queryFn: scoresApi.mine });

  const [tab, setTab] = useState<Tab>('overview');
  const [labLang, setLabLang] = useState<Exclude<CodeLanguage, 'NONE'>>('JAVASCRIPT');
  const [labCode, setLabCode] = useState(STARTERS.JAVASCRIPT);
  const [activeChallenge, setActiveChallenge] = useState<CodingChallenge | null>(null);
  const [challengeCode, setChallengeCode] = useState('');
  const [challengePass, setChallengePass] = useState<boolean | null>(null);
  const [openArticle, setOpenArticle] = useState<SkillArticle | null>(null);
  const [articleFilter, setArticleFilter] = useState<'all' | 'coding' | 'communication' | 'career'>('all');
  const [solved, setSolved] = useState<Set<string>>(new Set());

  // Hero deep-links (#skills-lab etc.)
  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash.replace('#', '');
      if (h === 'skills-lab') setTab('lab');
      if (h === 'skills-challenges') setTab('challenges');
      if (h === 'skills-learn') setTab('learn');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<string, StudentSkill[]>();
    for (const s of skillsQ.data ?? []) {
      const b = map.get(s.category);
      if (b) b.push(s);
      else map.set(s.category, [s]);
    }
    return [...map.entries()];
  }, [skillsQ.data]);

  const skills = skillsQ.data ?? [];
  const weakest = [...skills].sort((a, b) => a.score - b.score).slice(0, 3);
  const strongest = [...skills].sort((a, b) => b.score - a.score).slice(0, 3);
  const avg =
    skills.length > 0 ? Math.round(skills.reduce((a, s) => a + s.score, 0) / skills.length) : 0;
  const overall = scoreQ.data?.overallScore ?? avg;

  function switchLabLang(lang: Exclude<CodeLanguage, 'NONE'>) {
    setLabLang(lang);
    setLabCode(STARTERS[lang]);
  }

  function openChallenge(c: CodingChallenge) {
    setActiveChallenge(c);
    setChallengeCode(c.starterCode);
    setChallengePass(null);
    setTab('challenges');
  }

  function onChallengeOutput(result: RunCodeResult) {
    if (!activeChallenge?.expectedIncludes?.length) {
      setChallengePass(result.exitCode === 0);
      if (result.exitCode === 0) {
        setSolved((prev) => new Set(prev).add(activeChallenge!.id));
      }
      return;
    }
    const out = `${result.stdout}\n${result.stderr}`;
    const ok = activeChallenge.expectedIncludes.every((needle) =>
      out.toLowerCase().includes(needle.toLowerCase()),
    );
    setChallengePass(ok);
    if (ok) setSolved((prev) => new Set(prev).add(activeChallenge.id));
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Code2 }> = [
    { id: 'overview', label: 'Overview', icon: Trophy },
    { id: 'lab', label: 'Code lab', icon: Code2 },
    { id: 'challenges', label: 'Challenges', icon: Target },
    { id: 'learn', label: 'Articles', icon: BookOpen },
    { id: 'soft', label: 'Soft skills', icon: MessageSquare },
  ];

  const filteredArticles = SKILL_ARTICLES.filter(
    (a) => articleFilter === 'all' || a.track === articleFilter,
  );

  if (skillsQ.isLoading) return <Spinner />;
  if (skillsQ.error) return <Alert tone="error">Could not load your skills.</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        eyebrow="Skills academy"
        title="Level up"
        highlight="daily"
        subtitle={`${todayLabel()} · code, communicate, and compound — practice beats talent when talent doesn’t practice.`}
        actions={[
          { label: 'Open code lab', href: '#skills-lab', icon: Code2, primary: true },
          { label: 'Try a challenge', href: '#skills-challenges', icon: Target },
          { label: 'Read an article', href: '#skills-learn', icon: BookOpen },
        ]}
      >
        <HeroPanel title="Mastery pulse">
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
              <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.min(100, overall)} ${100 - Math.min(100, overall)}`}
                  pathLength={100}
                />
              </svg>
              <span className="absolute font-display text-sm font-extrabold">{overall}</span>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/60">Overall</div>
              <div className="text-sm font-semibold">{skills.length} tracked skills</div>
              <div className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-accent-300">
                <Flame className="h-3.5 w-3.5" aria-hidden />
                {solved.size} challenges cleared
              </div>
            </div>
          </div>
        </HeroPanel>
      </DashboardHero>

      {/* Full-bleed skills artwork strip */}
      <div className="relative overflow-hidden rounded-card border border-hair shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/artwork/skills-hub-hero.png"
          alt="Skills academy fox and owl practicing code and reading"
          className="h-40 w-full object-cover object-center sm:h-52"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1b3a]/85 via-[#0b1b3a]/35 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 max-w-lg text-white">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent-300">Practice hub</p>
          <p className="font-display text-xl font-extrabold sm:text-2xl">
            Coding emulator · challenges · articles · soft skills
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Skill average" value={`${avg}%`} icon={Sparkles} accent="bg-grad-holo" />
        <MiniStat
          label="Mastery score"
          value={scoreQ.data?.skillMasteryScore ?? '—'}
          icon={Trophy}
          accent="bg-grad-sunset"
        />
        <MiniStat
          label="Engagement"
          value={scoreQ.data?.engagementScore ?? '—'}
          icon={Flame}
          accent="bg-grad-aqua"
        />
        <MiniStat label="Solved today" value={solved.size} icon={CheckCircle2} accent="bg-grad-mint" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-card border border-hair bg-panel p-1.5 shadow-card">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id === 'lab') document.getElementById('skills-lab')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-panel px-3 py-2.5 text-sm font-bold transition sm:flex-none',
                active
                  ? 'bg-grad-holo text-white shadow-glow'
                  : 'text-faint hover:bg-chip hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="flex flex-col gap-4">
            {/* Constellation summary */}
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-grad-aqua opacity-20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-accent-400/20 blur-3xl" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-500">
                    Skill constellation
                  </p>
                  <h2 className="font-display text-xl font-extrabold">Your power map</h2>
                  <p className="mt-1 max-w-md text-sm text-faint">
                    Each orb is a skill. Tap one to jump into practice. Tiers: Spark → Building → Rising → Pro → Elite.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <RadialGauge percent={overall} label="overall" color="#f97316" size={110} />
                  <div className="hidden text-xs font-semibold text-faint sm:block">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-orange-500" /> Elite 85+
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" /> Pro 70+
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-sky-500" /> Rising 50+
                    </div>
                  </div>
                </div>
              </div>
              {scoreQ.data && (
                <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
                  <SkillPowerRail score={scoreQ.data.performanceScore} label="Performance" />
                  <SkillPowerRail score={scoreQ.data.engagementScore} label="Engagement" />
                  <SkillPowerRail score={scoreQ.data.consistencyScore} label="Consistency" />
                  <SkillPowerRail score={scoreQ.data.skillMasteryScore} label="Skill mastery" />
                </div>
              )}
            </Card>

            {weakest.length > 0 && (
              <Card className="overflow-hidden border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-panel">
                <div className="mb-2 flex items-center gap-2">
                  <Target className="h-4 w-4 text-accent-500" aria-hidden />
                  <h2 className="font-display font-bold">Boost these next</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {weakest.map((s) => (
                    <div key={s.skillId} className="rounded-panel border border-amber-200/50 bg-white/70 p-3">
                      <SkillPowerRail score={s.score} label={s.name} />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-2 w-full"
                        onClick={() => {
                          const hit = CODING_CHALLENGES.find((c) =>
                            c.skillTags.some((t) => t.toLowerCase() === s.name.toLowerCase()),
                          );
                          if (hit) openChallenge(hit);
                          else setTab('lab');
                        }}
                      >
                        Practice <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {skills.length === 0 ? (
              <Card className="py-10 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/artwork/mascot-skills.png"
                  alt=""
                  className="att-mascot mx-auto h-28 w-auto"
                  aria-hidden
                />
                <p className="mt-2 font-semibold">Your skill map is warming up</p>
                <p className="text-sm text-faint">
                  Complete quizzes or grind challenges in the lab — orbs will light up here.
                </p>
                <Button className="mt-4" onClick={() => setTab('lab')}>
                  Start in the code lab
                </Button>
              </Card>
            ) : (
              byCategory.map(([category, items]) => {
                const catAvg = Math.round(items.reduce((a, s) => a + s.score, 0) / items.length);
                const catTier = skillTier(catAvg);
                return (
                  <div key={category}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-xs font-extrabold uppercase tracking-wide text-faint">
                        {category}
                      </h2>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold text-white"
                        style={{ background: catTier.color }}
                      >
                        {catTier.label} · {catAvg}%
                      </span>
                    </div>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                      {items.map((s) => (
                        <SkillOrb
                          key={s.skillId}
                          name={s.name}
                          score={s.score}
                          trend={s.trend}
                          confidence={s.confidence}
                          onPractice={() => {
                            const hit = CODING_CHALLENGES.find((c) =>
                              c.skillTags.some((t) => t.toLowerCase() === s.name.toLowerCase()),
                            );
                            if (hit) openChallenge(hit);
                            else setTab('challenges');
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-col gap-4">
            <SectionArtworkPanel
              section="skills"
              titleOverride={strongest[0] ? `Strong in ${strongest[0].name}` : 'Build your stack'}
              blurbOverride="Mix coding drills with communication practice — both show up in placements."
            />
            {strongest.length > 0 && (
              <Card className="overflow-hidden">
                <h3 className="font-display font-bold">Top powers</h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {strongest.map((s, i) => (
                    <li key={s.skillId} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-grad-sunset text-xs font-extrabold text-white">
                        #{i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{s.name}</div>
                        <SkillPowerRail score={s.score} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card>
              <h3 className="font-display font-bold">Quick paths</h3>
              <ul className="mt-3 flex flex-col gap-2">
                <QuickLink
                  title="Free-run in the emulator"
                  sub="Any language, instant console"
                  onClick={() => setTab('lab')}
                />
                <QuickLink
                  title="Solve FizzBuzz"
                  sub="Easy JS warm-up"
                  onClick={() => openChallenge(CODING_CHALLENGES[0]!)}
                />
                <QuickLink
                  title="Standup communication"
                  sub="4-minute article"
                  onClick={() => {
                    setTab('learn');
                    setOpenArticle(SKILL_ARTICLES.find((a) => a.id === 'art-standup') ?? null);
                  }}
                />
              </ul>
            </Card>
          </div>
        </div>
      )}

      {tab === 'lab' && (
        <div id="skills-lab" className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Online coding emulator</h2>
                <p className="text-sm text-faint">
                  Run Python, JS/TS, Java, C/C++, SQL, or Web — same sandbox as assignments.
                </p>
              </div>
              <label className="flex flex-col gap-1 text-xs font-semibold text-faint">
                Language
                <Select
                  value={labLang}
                  onChange={(e) => switchLabLang(e.target.value as Exclude<CodeLanguage, 'NONE'>)}
                >
                  {LAB_LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <CodeWorkspace language={labLang} value={labCode} onChange={setLabCode} />
          </Card>
        </div>
      )}

      {tab === 'challenges' && (
        <div id="skills-challenges" className="grid gap-4 lg:grid-cols-[0.9fr_1.3fr]">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-hair px-4 py-3">
              <h2 className="font-display font-bold">Practice challenges</h2>
              <p className="text-xs text-faint">{CODING_CHALLENGES.length} labs · click to load in the emulator</p>
            </div>
            <ul className="max-h-[520px] divide-y divide-hair overflow-y-auto">
              {CODING_CHALLENGES.map((c) => {
                const active = activeChallenge?.id === c.id;
                const done = solved.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openChallenge(c)}
                      className={cn(
                        'flex w-full flex-col gap-1 px-4 py-3 text-left transition',
                        active ? 'bg-brand-50' : 'hover:bg-chip/60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{c.title}</span>
                        {done && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={c.difficulty === 'EASY' ? 'success' : c.difficulty === 'HARD' ? 'danger' : 'warning'}>
                          {c.difficulty}
                        </Badge>
                        <Badge tone="neutral">{c.language}</Badge>
                        {c.skillTags.map((t) => (
                          <Badge key={t} tone="brand">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="flex flex-col gap-3">
            {activeChallenge ? (
              <>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-lg font-bold">{activeChallenge.title}</h2>
                      <p className="mt-1 text-sm text-faint">{activeChallenge.prompt}</p>
                      {activeChallenge.hint && (
                        <p className="mt-2 inline-flex items-start gap-1.5 text-xs font-semibold text-brand-600">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          {activeChallenge.hint}
                        </p>
                      )}
                    </div>
                    {challengePass === true && (
                      <Badge tone="success">Passed ✓</Badge>
                    )}
                    {challengePass === false && <Badge tone="warning">Not yet — keep going</Badge>}
                  </div>
                </Card>
                <CodeWorkspace
                  language={activeChallenge.language}
                  value={challengeCode}
                  onChange={setChallengeCode}
                  onOutput={onChallengeOutput}
                />
              </>
            ) : (
              <Card className="flex flex-col items-center justify-center py-16 text-center">
                <Play className="h-8 w-8 text-brand-400" aria-hidden />
                <p className="mt-2 font-semibold">Pick a challenge</p>
                <p className="max-w-sm text-sm text-faint">
                  Starter code loads in the emulator. Run it — we soft-check the console output.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'learn' && (
        <div id="skills-learn" className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', 'All'],
                ['coding', 'Coding'],
                ['communication', 'Communication'],
                ['career', 'Career'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setArticleFilter(id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-bold transition',
                  articleFilter === id
                    ? 'bg-grad-holo text-white shadow-glow'
                    : 'bg-chip text-faint hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {filteredArticles.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setOpenArticle(a)}
                  className={cn(
                    'rounded-card border border-hair bg-panel p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-300',
                    openArticle?.id === a.id && 'border-brand-400 ring-2 ring-brand-400/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={a.track === 'coding' ? 'brand' : a.track === 'communication' ? 'warning' : 'success'}>
                      {a.track}
                    </Badge>
                    <span className="text-[11px] font-semibold text-faint">{a.minutes} min</span>
                  </div>
                  <h3 className="mt-2 font-display font-bold">{a.title}</h3>
                  <p className="mt-1 text-sm text-faint">{a.summary}</p>
                </button>
              ))}
            </div>

            <Card className="min-h-[320px]">
              {openArticle ? (
                <article>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-500">
                    {openArticle.track} · {openArticle.minutes} min read
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-extrabold">{openArticle.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {openArticle.skillTags.map((t) => (
                      <Badge key={t} tone="neutral">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-col gap-3 text-sm leading-relaxed text-ink">
                    {openArticle.body.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                  </div>
                  {openArticle.track === 'coding' && (
                    <Button className="mt-5" onClick={() => setTab('lab')}>
                      Practice in the lab
                    </Button>
                  )}
                </article>
              ) : (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                  <BookOpen className="h-8 w-8 text-brand-400" aria-hidden />
                  <p className="mt-2 font-semibold">Choose an article</p>
                  <p className="text-sm text-faint">Short reads for coding craft and communication.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'soft' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <SectionArtworkPanel
            section="skills"
            titleOverride="Communication is a skill too"
            blurbOverride="Placements hire humans who ship and who speak clearly. Drill both."
          />
          <div className="flex flex-col gap-3">
            {SOFT_DRILLS.map((d) => (
              <Card key={d.id}>
                <h3 className="font-display font-bold">{d.title}</h3>
                <p className="mt-2 text-sm text-ink">{d.prompt}</p>
                <p className="mt-3 inline-flex items-start gap-1.5 text-xs font-semibold text-brand-600">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {d.tip}
                </p>
                <SoftDrillPad />
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof Sparkles;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-hair bg-panel p-3.5 shadow-card">
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-panel text-white', accent)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-faint">{label}</div>
        <div className="font-display text-xl font-extrabold leading-none">{value}</div>
      </div>
    </div>
  );
}

function QuickLink({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-panel border border-hair bg-chip/40 px-3 py-2.5 text-left transition hover:bg-chip"
    >
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-faint">{sub}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-brand-500" aria-hidden />
    </button>
  );
}

function skillTier(score: number): { label: string; color: string; ring: string } {
  if (score >= 85) return { label: 'Elite', color: '#f97316', ring: 'from-orange-400 to-amber-300' };
  if (score >= 70) return { label: 'Pro', color: '#2563eb', ring: 'from-blue-500 to-sky-400' };
  if (score >= 50) return { label: 'Rising', color: '#0ea5e9', ring: 'from-sky-500 to-cyan-400' };
  if (score >= 30) return { label: 'Building', color: '#f59e0b', ring: 'from-amber-500 to-yellow-400' };
  return { label: 'Spark', color: '#94a3b8', ring: 'from-slate-400 to-slate-300' };
}

/** Animated arc meter — replaces flat progress bars on the overview. */
function SkillOrb({
  name,
  score,
  trend,
  confidence,
  onPractice,
}: {
  name: string;
  score: number;
  trend: string;
  confidence: number;
  onPractice?: () => void;
}) {
  const tier = skillTier(score);
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * c;

  return (
    <button
      type="button"
      onClick={onPractice}
      className="group relative flex flex-col items-center gap-2 rounded-card border border-hair bg-panel p-4 text-center shadow-card transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-glow"
    >
      <div className="relative h-[88px] w-[88px]">
        <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
          <circle cx="44" cy="44" r={r} fill="none" stroke="var(--fca-track)" strokeWidth="7" />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke={tier.color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${tier.color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg font-extrabold leading-none text-ink">{score}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide text-faint">xp</span>
        </div>
        <span
          className={cn(
            'absolute -right-1 -top-1 rounded-full bg-gradient-to-br px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow',
            tier.ring,
          )}
        >
          {tier.label}
        </span>
      </div>
      <div className="min-w-0 w-full">
        <div className="truncate text-sm font-bold text-ink group-hover:text-brand-600">{name}</div>
        <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-faint">
          <span>{trendIcon[trend] ?? '▬'} {trend}</span>
          <span>·</span>
          <span>{Math.round(confidence * 100)}% conf</span>
        </div>
      </div>
      {/* XP tick marks */}
      <div className="flex w-full gap-0.5 px-1">
        {[20, 40, 60, 80, 100].map((mark) => (
          <span
            key={mark}
            className={cn(
              'h-1 flex-1 rounded-full transition',
              score >= mark ? 'bg-grad-holo' : 'bg-track',
            )}
          />
        ))}
      </div>
    </button>
  );
}

/** Horizontal “power rail” with glow fill + milestone diamonds. */
function SkillPowerRail({ score, label }: { score: number; label?: string }) {
  const pct = Math.min(100, Math.max(0, score));
  const tier = skillTier(score);
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
          <span className="text-faint">{label}</span>
          <span style={{ color: tier.color }}>{pct}%</span>
        </div>
      )}
      <div className="relative h-3 overflow-visible rounded-full bg-track">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${tier.color}88, ${tier.color})`,
            boxShadow: `0 0 12px ${tier.color}55`,
          }}
        />
        {[25, 50, 75].map((m) => (
          <span
            key={m}
            className={cn(
              'absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-panel',
              pct >= m ? 'bg-white shadow' : 'bg-track',
            )}
            style={{ left: `${m}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function SoftDrillPad() {
  const [text, setText] = useState('');
  return (
    <div className="mt-3">
      <textarea
        className="min-h-24 w-full rounded-panel border border-hair bg-panel p-3 text-sm outline-none ring-brand-400 focus:ring-2"
        placeholder="Write your practice answer here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-1 text-right text-[11px] font-semibold text-faint">
        {text.trim().split(/\s+/).filter(Boolean).length} words
      </div>
    </div>
  );
}
