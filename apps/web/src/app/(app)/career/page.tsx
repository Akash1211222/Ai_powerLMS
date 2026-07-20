'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button, Input, Textarea, Select, Spinner, Alert } from '@fca/ui';
import {
  careerApi,
  type CareerProfile,
  type ExperienceKind,
  type ProfileVisibility,
} from '@/lib/career-api';
import type { PlacementTier } from '@/lib/placement-api';

const tierMeta: Record<PlacementTier, { tone: 'success' | 'warning' | 'danger' | 'brand'; label: string }> = {
  READY: { tone: 'success', label: 'Placement ready' },
  NEARLY_READY: { tone: 'brand', label: 'Nearly ready' },
  DEVELOPING: { tone: 'warning', label: 'Developing' },
  NOT_READY: { tone: 'danger', label: 'Not ready yet' },
};

const kindLabel: Record<ExperienceKind, string> = {
  WORK: 'Work',
  EDUCATION: 'Education',
  CERTIFICATION: 'Certification',
  VOLUNTEER: 'Volunteer',
};

type ProfileForm = Pick<
  CareerProfile,
  'headline' | 'summary' | 'location' | 'phone' | 'websiteUrl' | 'linkedinUrl' | 'githubUrl' | 'resumeUrl' | 'openToWork' | 'visibility'
>;

function toForm(p: CareerProfile): ProfileForm {
  return {
    headline: p.headline ?? '',
    summary: p.summary ?? '',
    location: p.location ?? '',
    phone: p.phone ?? '',
    websiteUrl: p.websiteUrl ?? '',
    linkedinUrl: p.linkedinUrl ?? '',
    githubUrl: p.githubUrl ?? '',
    resumeUrl: p.resumeUrl ?? '',
    openToWork: p.openToWork,
    visibility: p.visibility,
  };
}

export default function CareerPage() {
  const qc = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'career-profile'], queryFn: careerApi.mine });
  const resumeQ = useQuery({ queryKey: ['me', 'resume'], queryFn: careerApi.resume });

  const [form, setForm] = useState<ProfileForm | null>(null);
  useEffect(() => {
    if (profileQ.data && !form) setForm(toForm(profileQ.data));
  }, [profileQ.data, form]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['me', 'career-profile'] });
    qc.invalidateQueries({ queryKey: ['me', 'resume'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      // Empty strings → null so optional URLs don't fail validation.
      const clean = <T,>(v: T | '') => (v === '' ? null : v);
      return careerApi.update({
        headline: clean(f.headline),
        summary: clean(f.summary),
        location: clean(f.location),
        phone: clean(f.phone),
        websiteUrl: clean(f.websiteUrl),
        linkedinUrl: clean(f.linkedinUrl),
        githubUrl: clean(f.githubUrl),
        resumeUrl: clean(f.resumeUrl),
        openToWork: f.openToWork,
        visibility: f.visibility,
      });
    },
    onSuccess: invalidate,
  });

  if (profileQ.isLoading || !form) return <Spinner />;
  if (profileQ.error || !profileQ.data) return <Alert tone="error">Could not load your profile.</Alert>;
  const profile = profileQ.data;
  const set = (patch: Partial<ProfileForm>) => setForm((f) => ({ ...f!, ...patch }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Career Profile</h1>
          <p className="mt-1 text-sm text-faint">
            Your professional profile — shared with placement officers to match you with opportunities.
          </p>
        </div>
        {resumeQ.data && (
          <Badge tone={tierMeta[resumeQ.data.readiness.tier].tone}>
            {resumeQ.data.readiness.readinessScore} · {tierMeta[resumeQ.data.readiness.tier].label}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          {/* Profile fields */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Profile</h2>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.openToWork}
                  onChange={(e) => set({ openToWork: e.target.checked })}
                  className="h-4 w-4 accent-brand-500"
                />
                Open to work
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Headline</span>
              <Input value={form.headline ?? ''} onChange={(e) => set({ headline: e.target.value })} placeholder="Aspiring Data Analyst" />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Summary</span>
              <Textarea rows={3} value={form.summary ?? ''} onChange={(e) => set({ summary: e.target.value })} placeholder="A short professional objective…" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Location</span>
                <Input value={form.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="Bengaluru, IN" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Phone</span>
                <Input value={form.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} placeholder="+91…" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">LinkedIn URL</span>
                <Input value={form.linkedinUrl ?? ''} onChange={(e) => set({ linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">GitHub URL</span>
                <Input value={form.githubUrl ?? ''} onChange={(e) => set({ githubUrl: e.target.value })} placeholder="https://github.com/…" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Website URL</span>
                <Input value={form.websiteUrl ?? ''} onChange={(e) => set({ websiteUrl: e.target.value })} placeholder="https://…" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Resume URL</span>
                <Input value={form.resumeUrl ?? ''} onChange={(e) => set({ resumeUrl: e.target.value })} placeholder="https://…/resume.pdf" />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Visibility</span>
              <Select value={form.visibility} onChange={(e) => set({ visibility: e.target.value as ProfileVisibility })}>
                <option value="PRIVATE">Private — only you and admins</option>
                <option value="PLACEMENT">Placement — visible to placement officers</option>
                <option value="PUBLIC">Public — anyone with the link</option>
              </Select>
            </label>

            <div className="flex items-center gap-3">
              <Button onClick={() => save.mutate()} loading={save.isPending}>Save profile</Button>
              {save.isSuccess && <span className="text-sm text-success">Saved.</span>}
              {save.isError && <span className="text-sm text-danger">Could not save — check your URLs.</span>}
            </div>
          </Card>

          <ProjectsSection profile={profile} onChange={invalidate} />
          <ExperiencesSection profile={profile} onChange={invalidate} />
        </div>

        {/* Resume side panel */}
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-bold">Top skills</h2>
            {resumeQ.data && resumeQ.data.topSkills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {resumeQ.data.topSkills.map((s) => (
                  <Badge key={s.name} tone="brand">{s.name} · {s.score}%</Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-faint">Take quizzes to build your skill profile.</p>
            )}
          </Card>
          <Card>
            <h2 className="font-bold">Visibility</h2>
            <p className="mt-2 text-sm text-faint">
              {form.visibility === 'PLACEMENT'
                ? 'Placement officers in your organization can view this profile.'
                : form.visibility === 'PUBLIC'
                  ? 'Anyone with the link can view this profile.'
                  : 'Only you and admins can see this profile.'}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ProjectsSection({ profile, onChange }: { profile: CareerProfile; onChange: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [skills, setSkills] = useState('');

  const add = useMutation({
    mutationFn: () =>
      careerApi.addProject({
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim() || null,
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setUrl('');
      setSkills('');
      onChange();
    },
  });
  const del = useMutation({ mutationFn: careerApi.deleteProject, onSuccess: onChange });

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-bold">Projects</h2>
      {profile.projects.length === 0 ? (
        <p className="text-sm text-faint">No projects yet. Add your best work below.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profile.projects.map((p) => (
            <li key={p.id} className="rounded-panel border border-hair px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{p.title}</div>
                  {p.description && <div className="text-xs text-faint">{p.description}</div>}
                  {p.skills.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.skills.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
                    </div>
                  )}
                </div>
                <button onClick={() => del.mutate(p.id)} className="shrink-0 text-xs font-semibold text-danger hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 border-t border-hair pt-4 sm:grid-cols-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (optional)" />
        <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Skills, comma-separated" className="sm:col-span-2" />
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What you built…" className="sm:col-span-2" />
        <div className="sm:col-span-2">
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={title.trim().length < 2}>Add project</Button>
        </div>
      </div>
    </Card>
  );
}

function ExperiencesSection({ profile, onChange }: { profile: CareerProfile; onChange: () => void }) {
  const [kind, setKind] = useState<ExperienceKind>('WORK');
  const [title, setTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [current, setCurrent] = useState(false);

  const add = useMutation({
    mutationFn: () =>
      careerApi.addExperience({
        kind,
        title: title.trim(),
        organization: organization.trim(),
        startDate,
        endDate: current || !endDate ? null : endDate,
        current,
      }),
    onSuccess: () => {
      setTitle('');
      setOrganization('');
      setStartDate('');
      setEndDate('');
      setCurrent(false);
      onChange();
    },
  });
  const del = useMutation({ mutationFn: careerApi.deleteExperience, onSuccess: onChange });

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-bold">Experience & education</h2>
      {profile.experiences.length === 0 ? (
        <p className="text-sm text-faint">No entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profile.experiences.map((e) => (
            <li key={e.id} className="rounded-panel border border-hair px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{e.title}</span>
                    <Badge tone="neutral">{kindLabel[e.kind]}</Badge>
                  </div>
                  <div className="text-xs text-faint">
                    {e.organization} · {fmt(e.startDate)} – {e.current ? 'Present' : e.endDate ? fmt(e.endDate) : '—'}
                  </div>
                </div>
                <button onClick={() => del.mutate(e.id)} className="shrink-0 text-xs font-semibold text-danger hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 border-t border-hair pt-4 sm:grid-cols-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as ExperienceKind)}>
          {(Object.keys(kindLabel) as ExperienceKind[]).map((k) => (
            <option key={k} value={k}>{kindLabel[k]}</option>
          ))}
        </Select>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role or qualification" />
        <Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Organization" className="sm:col-span-2" />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-faint">Start</span>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-faint">End</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={current} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="h-4 w-4 accent-brand-500" />
          I currently work/study here
        </label>
        <div className="sm:col-span-2">
          <Button
            onClick={() => add.mutate()}
            loading={add.isPending}
            disabled={title.trim().length < 2 || organization.trim().length < 1 || !startDate}
          >
            Add entry
          </Button>
        </div>
      </div>
    </Card>
  );
}
