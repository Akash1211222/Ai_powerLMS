'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button, Input, Textarea, Spinner, Alert } from '@fca/ui';
import { alumniApi, type AlumniProfile, type UpdateAlumniInput } from '@/lib/alumni-api';

type Form = Pick<
  AlumniProfile,
  'graduationYear' | 'currentCompany' | 'currentRole' | 'industry' | 'location' | 'story' | 'linkedinUrl' | 'isPublished' | 'openToMentoring'
>;

function toForm(p: AlumniProfile): Form {
  return {
    graduationYear: p.graduationYear,
    currentCompany: p.currentCompany ?? '',
    currentRole: p.currentRole ?? '',
    industry: p.industry ?? '',
    location: p.location ?? '',
    story: p.story ?? '',
    linkedinUrl: p.linkedinUrl ?? '',
    isPublished: p.isPublished,
    openToMentoring: p.openToMentoring,
  };
}

export default function AlumniPage() {
  const qc = useQueryClient();
  const directory = useQuery({ queryKey: ['alumni'], queryFn: alumniApi.directory });
  const outcomes = useQuery({ queryKey: ['alumni', 'outcomes'], queryFn: alumniApi.outcomes });
  const profile = useQuery({ queryKey: ['me', 'alumni-profile'], queryFn: alumniApi.mine });

  const [form, setForm] = useState<Form | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (profile.data && !form) setForm(toForm(profile.data));
  }, [profile.data, form]);

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      const clean = (v: string | null) => (v === '' ? null : v);
      const input: UpdateAlumniInput = {
        graduationYear: f.graduationYear ? Number(f.graduationYear) : null,
        currentCompany: clean(f.currentCompany),
        currentRole: clean(f.currentRole),
        industry: clean(f.industry),
        location: clean(f.location),
        story: clean(f.story),
        linkedinUrl: clean(f.linkedinUrl),
        isPublished: f.isPublished,
        openToMentoring: f.openToMentoring,
      };
      return alumniApi.update(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alumni'] });
      qc.invalidateQueries({ queryKey: ['me', 'alumni-profile'] });
    },
  });

  if (directory.isLoading) return <Spinner />;
  if (directory.error) return <Alert tone="error">Could not load the alumni network.</Alert>;
  const people = directory.data ?? [];
  const o = outcomes.data;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f!, ...patch }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Alumni Network</h1>
          <p className="mt-1 text-sm text-faint">
            Where graduates landed — and what they&apos;d tell you to do differently.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((s) => !s)}>
          {open ? 'Close my profile' : 'My alumni profile'}
        </Button>
      </div>

      {/* Outcomes rollup */}
      {o && o.totalAlumni > 0 && (
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Alumni" value={String(o.totalAlumni)} />
            <Metric label="Open to mentoring" value={String(o.openToMentoring)} />
            <Metric label="Companies" value={String(o.topCompanies.length)} />
            <Metric label="Industries" value={String(o.topIndustries.length)} />
          </div>
          {o.topCompanies.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-faint">Top destinations</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {o.topCompanies.map((c) => (
                  <Badge key={c.company} tone="brand">
                    {c.company} · {c.count}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Own profile editor */}
      {open && form && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">My alumni profile</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Company">
              <Input value={form.currentCompany ?? ''} onChange={(e) => set({ currentCompany: e.target.value })} placeholder="Acme Analytics" />
            </Field>
            <Field label="Role">
              <Input value={form.currentRole ?? ''} onChange={(e) => set({ currentRole: e.target.value })} placeholder="Data Analyst" />
            </Field>
            <Field label="Industry">
              <Input value={form.industry ?? ''} onChange={(e) => set({ industry: e.target.value })} placeholder="Technology" />
            </Field>
            <Field label="Location">
              <Input value={form.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="Bengaluru" />
            </Field>
            <Field label="Graduation year">
              <Input
                type="number"
                value={form.graduationYear ?? ''}
                onChange={(e) => set({ graduationYear: e.target.value ? Number(e.target.value) : null })}
                placeholder="2024"
              />
            </Field>
            <Field label="LinkedIn URL">
              <Input value={form.linkedinUrl ?? ''} onChange={(e) => set({ linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" />
            </Field>
          </div>
          <Field label="Your advice to current students">
            <Textarea rows={3} value={form.story ?? ''} onChange={(e) => set({ story: e.target.value })} placeholder="What actually worked for you…" />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isPublished} onChange={(e) => set({ isPublished: e.target.checked })} className="h-4 w-4 accent-brand-500" />
              Show me in the directory
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.openToMentoring} onChange={(e) => set({ openToMentoring: e.target.checked })} className="h-4 w-4 accent-brand-500" />
              Open to mentoring
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
            {save.isSuccess && <span className="text-sm text-success">Saved.</span>}
            {save.isError && <span className="text-sm text-danger">Could not save — check your LinkedIn URL.</span>}
          </div>
        </Card>
      )}

      {/* Directory */}
      <div>
        <h2 className="mb-3 font-bold">Alumni</h2>
        {people.length === 0 ? (
          <Card>
            <p className="text-sm text-faint">
              No alumni have shared their profile yet. Be the first — open &quot;My alumni profile&quot; above.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {people.map((a) => (
              <Card key={a.userId} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{a.name}</div>
                    <div className="text-sm text-faint">
                      {[a.currentRole, a.currentCompany].filter(Boolean).join(' · ') || 'Alumnus'}
                    </div>
                    <div className="text-xs text-faint">
                      {[a.location, a.graduationYear ? `Class of ${a.graduationYear}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {a.openToMentoring && <Badge tone="success">Mentoring</Badge>}
                </div>
                {a.story && <p className="text-sm text-faint">“{a.story}”</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {a.industry && <Badge tone="neutral">{a.industry}</Badge>}
                  {a.linkedinUrl && (
                    <a href={a.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-500">
                      LinkedIn →
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel border border-hair bg-soft px-3 py-2">
      <div className="text-lg font-extrabold tracking-tight">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
