'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Field, Input, Badge, statusTone, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import {
  placementsApi,
  type ApplicationStatus,
  type JobPosting,
} from '@/lib/placements-api';
import { ApiError } from '@/lib/api-client';

const PIPELINE: ApplicationStatus[] = [
  'APPLIED',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFERED',
  'PLACED',
  'REJECTED',
];

export default function PlacementsPage() {
  const { user } = useAuth();
  const { org } = useActiveOrg();
  const canManage = user?.permissions.includes('placement:manage');

  if (!org) return <Spinner />;

  return canManage ? <OfficerView orgId={org.id} /> : <StudentView orgId={org.id} />;
}

function OfficerView({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: '',
    title: '',
    location: '',
    skills: '',
    description: '',
  });
  const [error, setError] = useState<string | null>(null);

  const jobsQ = useQuery({
    queryKey: ['placements', 'jobs', orgId],
    queryFn: () => placementsApi.listJobs(orgId),
  });

  const appsQ = useQuery({
    queryKey: ['placements', 'apps', selectedJobId],
    queryFn: () => placementsApi.applications(selectedJobId!),
    enabled: Boolean(selectedJobId),
  });

  const create = useMutation({
    mutationFn: () =>
      placementsApi.createJob({
        organizationId: orgId,
        companyName: form.companyName.trim(),
        title: form.title.trim(),
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setForm({ companyName: '', title: '', location: '', skills: '', description: '' });
      setError(null);
      qc.invalidateQueries({ queryKey: ['placements', 'jobs', orgId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create job'),
  });

  const publish = useMutation({
    mutationFn: (id: string) => placementsApi.publish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['placements', 'jobs', orgId] }),
  });

  const close = useMutation({
    mutationFn: (id: string) => placementsApi.close(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['placements', 'jobs', orgId] }),
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      placementsApi.updateApplication(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['placements', 'apps', selectedJobId] }),
  });

  if (jobsQ.isLoading) return <Spinner />;
  const jobs = jobsQ.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">Placement desk</span></h1>
        <p className="mt-1 text-faint">Create openings and move candidates through the pipeline.</p>
      </div>

      <Card>
        <h2 className="font-bold">New job posting</h2>
        {error && (
          <Alert tone="error" className="mt-3">
            {error}
          </Alert>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Company">
            {({ id }) => (
              <Input
                id={id}
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            )}
          </Field>
          <Field label="Role title">
            {({ id }) => (
              <Input
                id={id}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            )}
          </Field>
          <Field label="Location">
            {({ id }) => (
              <Input
                id={id}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            )}
          </Field>
          <Field label="Skills (comma-separated)">
            {({ id }) => (
              <Input
                id={id}
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
              />
            )}
          </Field>
        </div>
        <div className="mt-3">
          <Button
            onClick={() => create.mutate()}
            disabled={!form.companyName.trim() || !form.title.trim() || create.isPending}
          >
            Create draft
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold">Jobs</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-faint">No postings yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {jobs.map((j: JobPosting) => (
                <li
                  key={j.id}
                  className={`rounded-panel border p-3 ${selectedJobId === j.id ? 'border-brand-400 bg-brand-50' : 'border-hair'}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedJobId(j.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">{j.title}</div>
                        <div className="text-xs text-faint">{j.companyName}</div>
                      </div>
                      <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-faint">
                      {j._count?.applications ?? 0} applications
                      {j.skills?.length ? ` · ${j.skills.slice(0, 4).join(', ')}` : ''}
                    </div>
                  </button>
                  <div className="mt-2 flex gap-2">
                    {j.status === 'DRAFT' && (
                      <Button size="sm" onClick={() => publish.mutate(j.id)}>
                        Publish
                      </Button>
                    )}
                    {j.status === 'OPEN' && (
                      <Button size="sm" variant="secondary" onClick={() => close.mutate(j.id)}>
                        Close
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Applicant pipeline</h2>
          {!selectedJobId ? (
            <p className="text-sm text-faint">Select a job to view applicants.</p>
          ) : appsQ.isLoading ? (
            <Spinner />
          ) : (appsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-faint">No applications yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(appsQ.data ?? []).map((a) => (
                <li key={a.id} className="rounded-panel border border-hair p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        {a.student?.profile
                          ? `${a.student.profile.firstName} ${a.student.profile.lastName}`
                          : a.student?.email}
                      </div>
                      <div className="text-xs text-faint">{a.student?.email}</div>
                      {a.matchScore != null && (
                        <div className="mt-1 text-xs text-faint">
                          Match {a.matchScore}% — {a.matchReason}
                        </div>
                      )}
                    </div>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PIPELINE.filter((s) => s !== a.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rounded border border-hair px-2 py-0.5 text-xs font-semibold hover:bg-soft"
                        onClick={() => advance.mutate({ id: a.id, status: s })}
                      >
                        → {s}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StudentView({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [skills, setSkills] = useState('');
  const [roles, setRoles] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  const jobsQ = useQuery({
    queryKey: ['placements', 'open', orgId],
    queryFn: () => placementsApi.listOpen(orgId),
  });
  const appsQ = useQuery({
    queryKey: ['placements', 'mine'],
    queryFn: () => placementsApi.myApplications(),
  });
  const profileQ = useQuery({
    queryKey: ['placements', 'profile'],
    queryFn: () => placementsApi.getProfile(),
  });

  const apply = useMutation({
    mutationFn: (jobId: string) => placementsApi.apply(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements', 'open', orgId] });
      qc.invalidateQueries({ queryKey: ['placements', 'mine'] });
    },
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      placementsApi.updateProfile({
        skills: (skills || profileQ.data?.skills.join(', ') || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferredRoles: (roles || profileQ.data?.preferredRoles.join(', ') || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      setProfileSaved(true);
      qc.invalidateQueries({ queryKey: ['placements', 'profile'] });
    },
  });

  if (jobsQ.isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight"><span className="gradient-text">Job board</span></h1>
        <p className="mt-1 text-faint">Open roles from your college placement cell.</p>
      </div>

      <Card>
        <h2 className="font-bold">Your placement profile</h2>
        <p className="mt-1 text-xs text-faint">
          Skills power AI match scoring when you apply.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Skills (comma-separated)">
            {({ id }) => (
              <Input
                id={id}
                placeholder={profileQ.data?.skills.join(', ') || 'React, TypeScript, SQL'}
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
              />
            )}
          </Field>
          <Field label="Preferred roles">
            {({ id }) => (
              <Input
                id={id}
                placeholder={profileQ.data?.preferredRoles.join(', ') || 'Frontend Developer'}
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
            Save profile
          </Button>
          {profileSaved && <span className="text-sm text-faint">Saved.</span>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-bold">Open roles</h2>
          {(jobsQ.data ?? []).length === 0 ? (
            <Card>
              <p className="text-sm text-faint">No open jobs right now.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {(jobsQ.data ?? []).map((j) => (
                <Card key={j.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold">{j.title}</div>
                      <div className="text-sm text-faint">{j.companyName}</div>
                      {j.location && <div className="text-xs text-faint">{j.location}</div>}
                      {j.skills?.length > 0 && (
                        <div className="mt-1 text-xs text-faint">{j.skills.join(' · ')}</div>
                      )}
                    </div>
                    {j.myApplication ? (
                      <Badge tone={statusTone(j.myApplication.status)}>
                        {j.myApplication.status}
                      </Badge>
                    ) : (
                      <Button size="sm" onClick={() => apply.mutate(j.id)} disabled={apply.isPending}>
                        Apply
                      </Button>
                    )}
                  </div>
                  {j.myApplication?.matchScore != null && (
                    <div className="mt-2 text-xs text-faint">
                      Match score: {j.myApplication.matchScore}%
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-bold">My applications</h2>
          <Card>
            {(appsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-faint">You haven&apos;t applied yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(appsQ.data ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{a.jobPosting?.title}</div>
                      <div className="text-xs text-faint">{a.jobPosting?.companyName}</div>
                    </div>
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
