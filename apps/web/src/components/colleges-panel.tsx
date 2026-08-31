'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, Spinner, Alert, Field, Input } from '@fca/ui';
import Image from 'next/image';
import { adminApi } from '@/lib/lms-learning-api';
import { contrast, parseHex } from '@/lib/brand-theme';

/**
 * Opening a college.
 *
 * Every other piece of onboarding hangs off a college existing: staff are
 * created inside one, batches belong to one, and the branding that makes the
 * LMS feel like the college's own is stored on it. Until now nothing created
 * one — colleges only ever arrived through a seed, which meant onboarding a
 * customer needed someone with database access.
 *
 * This is the one screen in the product that reaches across tenants, so it is
 * gated on organization:manage, which only the platform owner holds. An
 * operations lead runs colleges; they do not open them.
 */

const BLANK = { name: '', displayName: '', logoUrl: '', primaryColor: '' };

export function CollegesPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK);
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
  const [openedWithLead, setOpenedWithLead] = useState(false);

  const collegesQ = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: () => adminApi.organizations(),
  });

  const leadsQ = useQuery({
    queryKey: ['admin', 'operational-leads'],
    queryFn: () => adminApi.operationalLeads(),
  });

  const createCollege = useMutation({
    mutationFn: () =>
      adminApi.createOrganization({
        name: form.name.trim(),
        // Empty is "not set", not an empty string — the API treats a missing
        // field as "keep the product's own look".
        displayName: form.displayName.trim() || undefined,
        logoUrl: form.logoUrl.trim() || undefined,
        primaryColor: form.primaryColor.trim() || undefined,
        operationalLeadIds: leadIds.length ? leadIds : undefined,
      }),
    onSuccess: (org) => {
      setOpened(org.name);
      setOpenedWithLead(leadIds.length > 0);
      setForm(BLANK);
      setLeadIds([]);
      void qc.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'operational-leads'] });
    },
  });

  const toggleLead = (id: string) =>
    setLeadIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const set = (k: keyof typeof BLANK) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card>
      <h2 className="mb-1 font-bold">Colleges</h2>
      <p className="mb-3 text-sm text-faint">
        Add a college here first. Once it exists you can add its batch manager, and when they sign
        in the LMS carries the college&rsquo;s own name, logo and colour.
      </p>

      {opened && (
        <Alert tone="success">
          <div className="font-semibold">{opened} added</div>
          <div className="mt-1 text-sm">
            {openedWithLead
              ? 'Their operations lead can reach it now — switch to it with the picker in the header to add its batch manager.'
              : 'Nobody runs it yet. Give it an operations lead above, or switch to it with the picker in the header to add staff directly.'}
          </div>
        </Alert>
      )}
      {createCollege.isError && (
        <Alert tone="error">
          {createCollege.error instanceof Error
            ? createCollege.error.message
            : 'Could not add that college.'}
        </Alert>
      )}

      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setOpened(null);
          createCollege.mutate();
        }}
      >
        <Field label="College name" hint="As it should appear on records">
          {({ id }) => (
            <Input
              id={id}
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder="St. Xavier's College, Mumbai"
              required
              minLength={2}
            />
          )}
        </Field>
        <Field label="Short name" hint="Optional. Used in the header, where space is tight">
          {({ id }) => (
            <Input
              id={id}
              value={form.displayName}
              onChange={(e) => set('displayName')(e.target.value)}
              placeholder="St. Xavier's"
            />
          )}
        </Field>
        <Field label="Logo address" hint="Optional. Must start with https://">
          {({ id }) => (
            <Input
              id={id}
              type="url"
              value={form.logoUrl}
              onChange={(e) => set('logoUrl')(e.target.value)}
              placeholder="https://college.edu/logo.png"
            />
          )}
        </Field>
        <Field label="Theme colour" hint="Optional. The LMS keeps it readable in dark mode">
          {({ id }) => (
            <div className="flex items-center gap-2">
              {/* A colour well next to the text box: picking is easier than
                  typing a hex code, and the text box still accepts one pasted
                  from a brand guide. */}
              <input
                type="color"
                aria-label="Pick theme colour"
                value={/^#[0-9a-fA-F]{6}$/.test(form.primaryColor) ? form.primaryColor : '#1e3a8a'}
                onChange={(e) => set('primaryColor')(e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded border border-subtle bg-transparent p-1"
              />
              <Input
                id={id}
                value={form.primaryColor}
                onChange={(e) => set('primaryColor')(e.target.value)}
                placeholder="#1e3a8a"
              />
            </div>
          )}
        </Field>
        <div className="sm:col-span-2">
          <div className="text-sm font-semibold">Who runs it</div>
          <p className="mb-2 text-sm text-faint">
            Optional. An operations lead can open the college straight away and add its staff. You
            can also leave it empty and add people yourself.
          </p>
          {leadsQ.isLoading && <Spinner />}
          {leadsQ.data?.length === 0 && (
            <p className="text-sm text-faint">
              No operations leads yet. Create one from &ldquo;Add a member&rdquo; in a college you
              already have, then they can be given this one too.
            </p>
          )}
          <div className="grid gap-1 sm:grid-cols-2">
            {leadsQ.data?.map((lead) => (
              <label key={lead.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={leadIds.includes(lead.id)}
                  onChange={() => toggleLead(lead.id)}
                />
                <span className="truncate">
                  {lead.name}
                  <span className="ml-1 text-xs text-faint">
                    · runs {lead.colleges} college{lead.colleges === 1 ? '' : 's'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={createCollege.isPending || form.name.trim().length < 2}>
            {createCollege.isPending ? 'Adding…' : 'Add college'}
          </Button>
        </div>
      </form>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-faint">On the platform</h3>
        {collegesQ.isLoading && <Spinner />}
        {collegesQ.isError && <Alert tone="error">Could not load the college list.</Alert>}
        {collegesQ.data?.length === 0 && <p className="text-sm text-faint">No colleges yet.</p>}
        <ul className="grid gap-2">
          {collegesQ.data?.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-subtle p-3"
            >
              <CollegeMark
                logoUrl={c.logoUrl}
                name={c.displayName ?? c.name}
                primaryColor={c.primaryColor}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.displayName ?? c.name}</div>
                <div className="truncate text-xs text-faint">
                  {c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.batchCount} batch
                  {c.batchCount === 1 ? '' : 'es'}
                </div>
              </div>
              {c.type !== 'COLLEGE' && <Badge tone="neutral">{c.type.toLowerCase()}</Badge>}
              {c.status !== 'ACTIVE' && <Badge tone="warning">{c.status.toLowerCase()}</Badge>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/**
 * A college at a glance: their logo if they have one, otherwise their initial
 * on their own colour. Deliberately not the header's OrgLogo, which falls back
 * to *our* logo — here that would make every unbranded college look identical.
 */
function CollegeMark({
  logoUrl,
  name,
  primaryColor,
}: {
  logoUrl: string | null;
  name: string;
  primaryColor: string | null;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={40}
        height={40}
        // Hosted by the college, so nothing the build can optimise ahead of time.
        unoptimized
        className="h-10 w-10 shrink-0 rounded object-contain"
      />
    );
  }
  // A college can choose a pale colour, and white on pale is unreadable. Pick
  // whichever of black or white actually stands out on it, using the same
  // contrast maths the theme uses.
  const bg = parseHex(primaryColor ?? '') ?? { r: 30, g: 58, b: 138 };
  const onDark = contrast(bg, { r: 255, g: 255, b: 255 });
  const onLight = contrast(bg, { r: 7, g: 14, b: 28 });

  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded font-bold"
      style={{
        background: `rgb(${bg.r} ${bg.g} ${bg.b})`,
        color: onDark >= onLight ? '#ffffff' : '#070e1c',
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
