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

const typeLabel: Record<OpportunityType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  INTERNSHIP: 'Internship',
  CONTRACT: 'Contract',
};
const modeLabel: Record<WorkMode, string> = { ONSITE: 'On-site', REMOTE: 'Remote', HYBRID: 'Hybrid' };

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

  if (q.isLoading) return <Spinner />;
  if (q.error) return <Alert tone="error">Could not load opportunities.</Alert>;
  const items = q.data ?? [];

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-sm text-faint">No open opportunities right now. Check back soon.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((o) => (
        <DiscoverCard key={o.id} o={o} />
      ))}
    </div>
  );
}

function DiscoverCard({ o }: { o: DiscoverOpportunity }) {
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

      <div className="flex items-center gap-3">
        <Badge tone={o.match.eligible ? 'success' : 'warning'}>
          {o.match.eligible ? 'Eligible to apply' : `Needs readiness ≥ ${o.minReadiness}`}
        </Badge>
        {o.applyUrl && (
          <a href={o.applyUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-500">
            Apply externally →
          </a>
        )}
      </div>
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
          items.map((o) => (
            <Card key={o.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold">{o.title}</div>
                  <div className="text-sm text-faint">
                    {o.companyName}
                    {o.location ? ` · ${o.location}` : ''} · {typeLabel[o.type]}
                  </div>
                </div>
                <Badge tone={o.status === 'OPEN' ? 'success' : o.status === 'CLOSED' ? 'neutral' : 'warning'}>
                  {o.status}
                </Badge>
              </div>
              {o.requirements.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {o.requirements.map((r) => (
                    <Badge key={r} tone="neutral">{r}</Badge>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                {o.status !== 'OPEN' && (
                  <Button onClick={() => publish.mutate(o.id)} loading={publish.isPending}>
                    Publish
                  </Button>
                )}
                {o.status === 'OPEN' && (
                  <Button variant="secondary" onClick={() => close.mutate(o.id)} loading={close.isPending}>
                    Close
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <CreateForm organizationId={org.id} onCreated={invalidate} />
    </div>
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
