'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Video,
  Radio,
  LogOut,
  Square,
  ExternalLink,
  Timer,
  FileSpreadsheet,
  Sparkles,
  ListChecks,
  HelpCircle,
  BookOpen,
  Users,
} from 'lucide-react';
import { Card, Button, Badge, Spinner, Alert, Textarea, Input } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { liveApi, type LiveQaItem, type LivePresence } from '@/lib/live-api';
import { formatDate, formatTime } from '@/lib/format';
import { DashboardHero, HeroPanel } from '@/components/dashboard-hero';
import { ApiError } from '@/lib/api-client';

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function asQaItems(v: unknown): LiveQaItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const q = (x as LiveQaItem).question;
      if (typeof q !== 'string' || !q.trim()) return null;
      const answer = (x as LiveQaItem).answer;
      return { question: q, answer: typeof answer === 'string' ? answer : undefined };
    })
    .filter((x): x is LiveQaItem => Boolean(x));
}

export default function LiveClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [watchedSec, setWatchedSec] = useState(0);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [keyPointsText, setKeyPointsText] = useState('');
  const [homework, setHomework] = useState('');
  const [qaText, setQaText] = useState('');
  const [googleEmail, setGoogleEmail] = useState(user?.googleEmail ?? '');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const canManage =
    user?.permissions.includes('attendance:mark') ||
    user?.permissions.includes('batch:manage') ||
    user?.permissions.includes('course:update');

  const q = useQuery({ queryKey: ['live', id], queryFn: () => liveApi.get(id), refetchInterval: 15_000 });

  useEffect(() => {
    if (!q.data) return;
    setSummary(q.data.summary ?? '');
    setKeyPointsText(asStringArray(q.data.keyPoints).join('\n'));
    setHomework(q.data.homework ?? '');
    setQaText(
      asQaItems(q.data.qaItems)
        .map((i) => (i.answer ? `${i.question} | ${i.answer}` : i.question))
        .join('\n'),
    );
  }, [q.data]);

  useEffect(() => {
    setGoogleEmail(user?.googleEmail ?? '');
  }, [user?.googleEmail]);

  const join = useMutation({
    mutationFn: () => liveApi.join(id),
    onSuccess: (res) => {
      setJoined(true);
      setWatchedSec(res.presence.watchedSec);
      setError(null);
      if (res.meetingUrl) window.open(res.meetingUrl, '_blank', 'noopener,noreferrer');
      qc.invalidateQueries({ queryKey: ['live', id] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not join'),
  });

  const leave = useMutation({
    mutationFn: () => liveApi.leave(id),
    onSuccess: () => {
      setJoined(false);
      if (timer.current) clearInterval(timer.current);
      qc.invalidateQueries({ queryKey: ['live', id] });
    },
  });

  const end = useMutation({
    mutationFn: () => liveApi.end(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['live', id] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not end class'),
  });

  const importAtt = useMutation({
    mutationFn: () => liveApi.importAttendance(id, csvText, true),
    onSuccess: (res) => {
      setImportResult(
        `Imported ${res.summary.matched} · ${res.summary.present} present · ${res.summary.late} late · ${res.summary.absent} absent · avg ${res.summary.avgWatchPercent}%` +
          (res.unmatched.length ? ` · ${res.unmatched.length} unmatched emails` : ''),
      );
      setCsvText('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['live', id] });
      qc.invalidateQueries({ queryKey: ['live', 'reports'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Import failed'),
  });

  const saveSummary = useMutation({
    mutationFn: () => {
      const keyPoints = keyPointsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const qaItems = qaText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [question, ...rest] = line.split('|');
          return { question: question.trim(), answer: rest.join('|').trim() || undefined };
        });
      return liveApi.updateSummary(id, {
        summary: summary.trim() || null,
        keyPoints: keyPoints.length ? keyPoints : null,
        homework: homework.trim() || null,
        qaItems: qaItems.length ? qaItems : null,
      });
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['live', id] });
      qc.invalidateQueries({ queryKey: ['live', 'notes'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save summary'),
  });

  const saveGoogle = useMutation({
    mutationFn: () => liveApi.setGoogleEmail(googleEmail.trim() || null),
    onSuccess: () => {
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save Google email'),
  });

  useEffect(() => {
    if (!joined) return;
    timer.current = setInterval(() => {
      liveApi
        .heartbeat(id, 30)
        .then((r) => setWatchedSec(r.watchedSec))
        .catch(() => undefined);
    }, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [joined, id]);

  const roster = useMemo(() => (q.data?.presences ?? []) as LivePresence[], [q.data?.presences]);

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="error">Live class not found.</Alert>;
  const c = q.data;
  const mins = Math.floor(watchedSec / 60);
  const secs = watchedSec % 60;
  const keyPoints = asStringArray(c.keyPoints);
  const qaItems = asQaItems(c.qaItems);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/live" className="text-sm font-semibold text-brand-500">
        ← Live classes
      </Link>

      <DashboardHero
        eyebrow="Live uplink"
        title={c.title}
        subtitle={`${c.batch?.course?.title ?? 'Course'} · ${c.batch?.name ?? 'Batch'} · ${formatDate(c.startsAt)} ${formatTime(c.startsAt)}–${formatTime(c.endsAt)}`}
      >
        <HeroPanel title="Status">
          <Badge tone={c.status === 'LIVE' ? 'success' : c.status === 'ENDED' ? 'neutral' : 'brand'}>
            {c.status}
          </Badge>
          <p className="mt-2 text-xs text-white/70">
            Join with your registered Google account. Final attendance = Meet duration %.
          </p>
        </HeroPanel>
      </DashboardHero>

      {error && <Alert tone="error">{error}</Alert>}
      {importResult && <Alert tone="success">{importResult}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="relative overflow-hidden border-brand-400/20 bg-gradient-to-br from-panel via-panel to-brand-500/5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/10 blur-2xl" />
          <div className="relative flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-brand-500" aria-hidden />
              <h2 className="font-display font-bold">Google Meet classroom</h2>
            </div>
            {c.meetingUrl ? (
              <a
                href={c.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm font-semibold text-brand-600 hover:underline"
              >
                {c.meetingUrl}
              </a>
            ) : (
              <p className="text-sm text-faint">No meeting link yet.</p>
            )}
            {c.description && <p className="text-sm text-faint">{c.description}</p>}

            <div className="flex flex-wrap gap-2">
              {!joined && c.status !== 'ENDED' && c.status !== 'CANCELLED' && (
                <Button onClick={() => join.mutate()} loading={join.isPending}>
                  <Radio className="mr-1.5 h-4 w-4" aria-hidden />
                  Join Meet
                </Button>
              )}
              {joined && (
                <Button variant="secondary" onClick={() => leave.mutate()} loading={leave.isPending}>
                  <LogOut className="mr-1.5 h-4 w-4" aria-hidden />
                  Leave LMS presence
                </Button>
              )}
              {c.meetingUrl && (
                <Button
                  variant="secondary"
                  onClick={() => window.open(c.meetingUrl!, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden />
                  Open Meet
                </Button>
              )}
              {canManage && c.status !== 'ENDED' && (
                <Button variant="secondary" onClick={() => end.mutate()} loading={end.isPending}>
                  <Square className="mr-1.5 h-4 w-4" aria-hidden />
                  End (app presence only)
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-accent-500" aria-hidden />
            <h2 className="font-display font-bold">LMS soft presence</h2>
          </div>
          <div className="font-display text-4xl font-extrabold tracking-tight text-brand-600">
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
          <p className="text-xs text-faint">
            Soft signal while this tab is open. <strong>Official attendance</strong> comes from the Meet
            attendance export (≥75% present · ≥40% late · else absent).
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-faint">Your Google Meet email</span>
            <div className="flex gap-2">
              <Input
                value={googleEmail}
                onChange={(e) => setGoogleEmail(e.target.value)}
                placeholder={user?.email ?? 'you@gmail.com'}
              />
              <Button variant="secondary" onClick={() => saveGoogle.mutate()} loading={saveGoogle.isPending}>
                Save
              </Button>
            </div>
          </label>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent-500" aria-hidden />
            <h2 className="font-display font-bold">Session summary & key points</h2>
          </div>
          {canManage ? (
            <>
              <p className="text-xs text-faint">
                After class, paste notes from Meet’s AI summary / Gemini extension.
              </p>
              <Textarea
                rows={5}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Overall summary of what was discussed…"
              />
              <label className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-faint">
                  <ListChecks className="h-3.5 w-3.5" /> Key points (one per line)
                </span>
                <Textarea rows={4} value={keyPointsText} onChange={(e) => setKeyPointsText(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-faint">
                  <BookOpen className="h-3.5 w-3.5" /> Homework / follow-ups
                </span>
                <Textarea rows={3} value={homework} onChange={(e) => setHomework(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-faint">
                  <HelpCircle className="h-3.5 w-3.5" /> Q&A solved (question | answer per line)
                </span>
                <Textarea rows={4} value={qaText} onChange={(e) => setQaText(e.target.value)} />
              </label>
              <Button onClick={() => saveSummary.mutate()} loading={saveSummary.isPending}>
                Save session notes
              </Button>
            </>
          ) : (
            <SessionNotesRead
              summary={c.summary}
              keyPoints={keyPoints}
              homework={c.homework}
              qaItems={qaItems}
            />
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {canManage && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-brand-500" aria-hidden />
                <h2 className="font-display font-bold">Import Meet attendance</h2>
              </div>
              <p className="text-xs text-faint">
                Paste CSV from Google Meet → Attendance report (needs Email + Duration / Time in call
                columns). Ends the class and marks % for the day.
              </p>
              <Textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={'Name,Email,Duration\nAda Lovelace,ada@college.edu,1:00:00'}
                className="font-mono text-xs"
              />
              <Button
                onClick={() => importAtt.mutate()}
                loading={importAtt.isPending}
                disabled={csvText.trim().length < 10}
              >
                Import & mark attendance
              </Button>
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand-500" aria-hidden />
              <h2 className="font-display font-bold">Roster</h2>
            </div>
            {roster.length === 0 ? (
              <p className="text-sm text-faint">No presence yet — import Meet CSV after class.</p>
            ) : (
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {roster.map((p) => {
                  const name = p.student.profile
                    ? `${p.student.profile.firstName} ${p.student.profile.lastName}`
                    : p.student.email;
                  const pct = p.attendancePct ?? null;
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-panel border border-hair px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{name}</div>
                        <div className="truncate text-[11px] text-faint">
                          {p.meetEmail ?? p.student.email}
                          {p.source === 'MEET_IMPORT' ? ' · Meet import' : ' · App'}
                        </div>
                      </div>
                      <span className="shrink-0 font-display text-sm font-extrabold text-brand-600">
                        {pct != null ? `${pct}%` : `${Math.round(p.watchedSec / 60)}m`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {!canManage && (c.summary || keyPoints.length || c.homework || qaItems.length) ? null : null}
    </div>
  );
}

function SessionNotesRead({
  summary,
  keyPoints,
  homework,
  qaItems,
}: {
  summary?: string | null;
  keyPoints: string[];
  homework?: string | null;
  qaItems: LiveQaItem[];
}) {
  if (!summary && keyPoints.length === 0 && !homework && qaItems.length === 0) {
    return <p className="text-sm text-faint">Trainer hasn’t published session notes yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4 text-sm">
      {summary && (
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-faint">Summary</div>
          <p className="mt-1 whitespace-pre-wrap text-ink">{summary}</p>
        </div>
      )}
      {keyPoints.length > 0 && (
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-faint">Key points</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {keyPoints.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      )}
      {homework && (
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-faint">Homework</div>
          <p className="mt-1 whitespace-pre-wrap">{homework}</p>
        </div>
      )}
      {qaItems.length > 0 && (
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-faint">Q&A</div>
          <ul className="mt-2 flex flex-col gap-2">
            {qaItems.map((item) => (
              <li key={item.question} className="rounded-panel border border-hair bg-chip px-3 py-2">
                <div className="font-semibold">{item.question}</div>
                {item.answer && <div className="mt-1 text-faint">{item.answer}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
