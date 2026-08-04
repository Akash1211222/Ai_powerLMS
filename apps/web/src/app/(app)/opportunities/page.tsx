'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Button, Input, Textarea, Select, Spinner, Alert } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import { useActiveOrg } from '@/lib/use-active-org';
import {
  opportunitiesApi,
  type DiscoverOpportunity,
  type Opportunity,
  type OpportunityType,
  type WorkMode,
} from '@/lib/opportunities-api';
import { applicationsApi, type ApplicationStatus, type ReviewStatus } from '@/lib/applications-api';
import { referralsApi } from '@/lib/referrals-api';

const typeLabel: Record<OpportunityType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  INTERNSHIP: 'Internship',
  CONTRACT: 'Contract',
};
const modeLabel: Record<WorkMode, string> = { ONSITE: 'On-site', REMOTE: 'Remote', HYBRID: 'Hybrid' };

const statusTone: Record<ApplicationStatus, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  APPLIED: 'brand',
  UNDER_REVIEW: 'brand',
  SHORTLISTED: 'warning',
  INTERVIEW: 'warning',
  OFFERED: 'success',
  HIRED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};
const statusLabel = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const REVIEW_STATUSES: ReviewStatus[] = ['UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED'];

function matchTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 67) return 'success';
  if (score >= 34) return 'warning';
  return 'danger';
}

export default function OpportunitiesPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('placement:manage');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Opportunities</h1>
        <p className="mt-1 text-sm text-faint">
          {canManage
            ? 'Post roles and manage your placement pipeline.'
            : 'Roles matched to your skills and placement readiness.'}
        </p>
      </div>
      {canManage ? <ManageView /> : <DiscoverView />}
    </div>
  );
}

// --- Student discovery --------------------------------------------------

function DiscoverView() {
  const q = useQuery({ queryKey: ['me', 'opportunities'], queryFn: opportunitiesApi.discover });
  const applications = useQuery({ queryKey: ['me', 'applications'], queryFn: applicationsApi.mine });
  const referrals = useQuery({ queryKey: ['me', 'referrals'], queryFn: referralsApi.mine });

  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="error">Could not load opportunities.</Alert>;
  const items = q.data ?? [];
  const myApps = (applications.data ?? []).filter((a) => a.status !== 'WITHDRAWN');
  // Opportunities the network has vouched for me on (§30).
  const referredOn = new Set((referrals.data?.received ?? []).map((r) => r.opportunityId));

  return (
    <div className="flex flex-col gap-6">
      {myApps.length > 0 && (
        <div>
          <h2 className="mb-3 font-bold">My applications</h2>
          <Card className="p-0">
            <ul className="divide-y divide-hair">
              {myApps.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{a.opportunity.title}</div>
                    <div className="truncate text-xs text-faint">{a.opportunity.companyName}</div>
                  </div>
                  <Badge tone={statusTone[a.status]}>{statusLabel(a.status)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div>
        <h2 className="mb-3 font-bold">Open roles</h2>
        {items.length === 0 ? (
          <Card>
            <p className="text-sm text-faint">No open opportunities right now. Check back soon.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((o) => (
              <DiscoverCard key={o.id} o={o} referred={referredOn.has(o.id)} canRefer={referrals.data?.canRefer ?? false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiscoverCard({
  o,
  referred,
  canRefer,
}: {
  o: DiscoverOpportunity;
  referred: boolean;
  canRefer: boolean;
}) {
  const qc = useQueryClient();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [showRefer, setShowRefer] = useState(false);
  const [referEmail, setReferEmail] = useState('');
  const [referNote, setReferNote] = useState('');

  const refer = useMutation({
    mutationFn: () => referralsApi.create(o.id, referEmail.trim(), referNote.trim()),
    onSuccess: () => {
      setShowRefer(false);
      setReferEmail('');
      setReferNote('');
      qc.invalidateQueries({ queryKey: ['me', 'referrals'] });
    },
  });

  const apply = useMutation({
    mutationFn: () => applicationsApi.apply(o.id, note.trim() || undefined),
    onSuccess: () => {
      setShowNote(false);
      setNote('');
      qc.invalidateQueries({ queryKey: ['me', 'opportunities'] });
      qc.invalidateQueries({ queryKey: ['me', 'applications'] });
    },
  });

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">{o.title}</div>
          <div className="text-sm text-faint">
            {o.companyName}
            {o.location ? ` · ${o.location}` : ''} · {modeLabel[o.workMode]} · {typeLabel[o.type]}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge tone={matchTone(o.match.matchScore)}>{o.match.matchScore}% match</Badge>
          {referred && <Badge tone="success">★ Referred</Badge>}
          {!o.match.eligible && <Badge tone="danger">Below readiness gate</Badge>}
        </div>
      </div>

      <p className="text-sm text-faint">{o.description}</p>

      {o.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.requirements.map((r) => {
            const has = o.match.matchedSkills.includes(r);
            return (
              <Badge key={r} tone={has ? 'success' : 'neutral'}>
                {has ? '✓ ' : ''}
                {r}
              </Badge>
            );
          })}
        </div>
      )}

      {showNote && (
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a short cover note (optional)…"
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {o.applicationStatus ? (
          <Badge tone={statusTone[o.applicationStatus as ApplicationStatus]}>
            {statusLabel(o.applicationStatus)}
          </Badge>
        ) : o.match.eligible ? (
          showNote ? (
            <Button onClick={() => apply.mutate()} loading={apply.isPending}>Submit application</Button>
          ) : (
            <Button onClick={() => setShowNote(true)}>Apply</Button>
          )
        ) : (
          <Badge tone="warning">Needs readiness ≥ {o.minReadiness}</Badge>
        )}
        {apply.isError && <span className="text-sm text-danger">Could not apply.</span>}
        {o.applyUrl && (
          <a href={o.applyUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-500">
            Apply externally →
          </a>
        )}
        {canRefer && (
          <button onClick={() => setShowRefer((s) => !s)} className="text-sm font-semibold text-brand-500">
            {showRefer ? 'Cancel referral' : 'Refer someone →'}
          </button>
        )}
      </div>

      {canRefer && showRefer && (
        <div className="flex flex-col gap-2 rounded-panel bg-soft p-3">
          <Input
            type="email"
            value={referEmail}
            onChange={(e) => setReferEmail(e.target.value)}
            placeholder="Their email address"
          />
          <Textarea
            rows={2}
            value={referNote}
            onChange={(e) => setReferNote(e.target.value)}
            placeholder="Why you're vouching for them (min 10 characters)…"
          />
          <Button
            onClick={() => refer.mutate()}
            loading={refer.isPending}
            disabled={!referEmail.includes('@') || referNote.trim().length < 10}
          >
            Submit referral
          </Button>
          {refer.isSuccess && <span className="text-sm text-success">Referral sent.</span>}
          {refer.isError && <span className="text-sm text-danger">Could not refer — check the email and try again.</span>}
        </div>
      )}
    </Card>
  );
}

// --- Staff management ---------------------------------------------------

function ManageView() {
  const qc = useQueryClient();
  const { org, isLoading: orgLoading } = useActiveOrg();
  const list = useQuery({
    queryKey: ['opportunities', org?.id],
    queryFn: () => opportunitiesApi.list(org!.id),
    enabled: Boolean(org?.id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['opportunities', org?.id] });
  const publish = useMutation({ mutationFn: opportunitiesApi.publish, onSuccess: invalidate });
  const close = useMutation({ mutationFn: opportunitiesApi.close, onSuccess: invalidate });

  if (orgLoading || list.isLoading) return <Spinner />;
  if (!org) return <Alert tone="error">No organization found.</Alert>;
  const items = list.data?.data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <Card>
            <p className="text-sm text-faint">No opportunities yet. Post your first role →</p>
          </Card>
        ) : (
          items.map((o) => <ManageCard key={o.id} o={o} onPublish={() => publish.mutate(o.id)} onClose={() => close.mutate(o.id)} busy={publish.isPending || close.isPending} />)
        )}
      </div>

      <CreateForm organizationId={org.id} onCreated={invalidate} />
    </div>
  );
}

function ManageCard({ o, onPublish, onClose, busy }: { o: Opportunity; onPublish: () => void; onClose: () => void; busy: boolean }) {
  const [showApplicants, setShowApplicants] = useState(false);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">{o.title}</div>
          <div className="text-sm text-faint">
            {o.companyName}
            {o.location ? ` · ${o.location}` : ''} · {typeLabel[o.type]}
          </div>
        </div>
        <Badge tone={o.status === 'OPEN' ? 'success' : o.status === 'CLOSED' ? 'neutral' : 'warning'}>{o.status}</Badge>
      </div>
      {o.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {o.requirements.map((r) => (
            <Badge key={r} tone="neutral">{r}</Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {o.status !== 'OPEN' && <Button onClick={onPublish} loading={busy}>Publish</Button>}
        {o.status === 'OPEN' && <Button variant="secondary" onClick={onClose} loading={busy}>Close</Button>}
        <button
          onClick={() => setShowApplicants((s) => !s)}
          className="text-sm font-semibold text-brand-500"
        >
          {showApplicants ? 'Hide applicants' : 'View applicants'}
        </button>
      </div>
      {showApplicants && <Applicants opportunityId={o.id} />}
    </Card>
  );
}

function Applicants({ opportunityId }: { opportunityId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['opportunity', opportunityId, 'applications'],
    queryFn: () => applicationsApi.forOpportunity(opportunityId),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) => applicationsApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunity', opportunityId, 'applications'] }),
  });

  if (q.isLoading) return <Spinner />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <p className="border-t border-hair pt-3 text-sm text-faint">No applicants yet.</p>;

  const TERMINAL = ['HIRED', 'REJECTED', 'WITHDRAWN'];
  return (
    <ul className="flex flex-col gap-2 border-t border-hair pt-3">
      {rows.map((a) => {
        const name = a.student.profile ? `${a.student.profile.firstName} ${a.student.profile.lastName}` : a.student.email;
        const terminal = TERMINAL.includes(a.status);
        return (
          <li key={a.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{name}</div>
              <div className="text-xs text-faint">
                Readiness {a.readinessSnapshot ?? '—'} · Match {a.matchSnapshot ?? '—'}%
                {a.referralCount > 0 && ` · ★ ${a.referralCount} referral${a.referralCount === 1 ? '' : 's'}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={statusTone[a.status]}>{statusLabel(a.status)}</Badge>
              {!terminal && (
                <Select
                  value=""
                  onChange={(e) => e.target.value && setStatus.mutate({ id: a.id, status: e.target.value as ReviewStatus })}
                  className="h-9 w-36"
                >
                  <option value="">Move to…</option>
                  {REVIEW_STATUSES.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </Select>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CreateForm({ organizationId, onCreated }: { organizationId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<OpportunityType>('FULL_TIME');
  const [workMode, setWorkMode] = useState<WorkMode>('ONSITE');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [minReadiness, setMinReadiness] = useState('');

  const create = useMutation({
    mutationFn: () =>
      opportunitiesApi.create({
        organizationId,
        title: title.trim(),
        companyName: companyName.trim(),
        location: location.trim() || null,
        type,
        workMode,
        description: description.trim(),
        requirements: requirements.split(',').map((s) => s.trim()).filter(Boolean),
        minReadiness: minReadiness ? Number(minReadiness) : null,
      }),
    onSuccess: () => {
      setTitle('');
      setCompanyName('');
      setLocation('');
      setDescription('');
      setRequirements('');
      setMinReadiness('');
      onCreated();
    },
  });

  const valid = title.trim().length >= 2 && companyName.trim().length >= 1 && description.trim().length >= 10;

  return (
    <Card className="flex h-fit flex-col gap-3">
      <h2 className="font-bold">Post an opportunity</h2>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role title" />
      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company" />
      <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" />
      <div className="grid grid-cols-2 gap-2">
        <Select value={type} onChange={(e) => setType(e.target.value as OpportunityType)}>
          {(Object.keys(typeLabel) as OpportunityType[]).map((t) => (
            <option key={t} value={t}>{typeLabel[t]}</option>
          ))}
        </Select>
        <Select value={workMode} onChange={(e) => setWorkMode(e.target.value as WorkMode)}>
          {(Object.keys(modeLabel) as WorkMode[]).map((m) => (
            <option key={m} value={m}>{modeLabel[m]}</option>
          ))}
        </Select>
      </div>
      <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Role description (min 10 chars)…" />
      <Input value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Required skills, comma-separated" />
      <Input
        type="number"
        value={minReadiness}
        onChange={(e) => setMinReadiness(e.target.value)}
        placeholder="Min readiness 0–100 (optional)"
        min={0}
        max={100}
      />
      <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!valid}>
        Create draft
      </Button>
      {create.isError && <span className="text-sm text-danger">Could not create — check the fields.</span>}
    </Card>
  );
}
