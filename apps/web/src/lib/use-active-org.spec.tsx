import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pickActiveOrg, useActiveOrg, __resetActiveOrg } from './use-active-org';
import type { Organization } from './lms-api';

const org = (id: string, extra: Partial<Organization> = {}): Organization => ({
  id,
  name: id,
  slug: id,
  type: 'COLLEGE',
  ...extra,
});

describe('pickActiveOrg', () => {
  it('shows nothing while the list is still loading', () => {
    expect(pickActiveOrg([], null)).toBeUndefined();
  });

  it('defaults to the primary membership, not simply the first', () => {
    const orgs = [org('second'), org('home', { isPrimary: true })];
    expect(pickActiveOrg(orgs, null)?.id).toBe('home');
  });

  it('falls back to the first when nothing is marked primary', () => {
    expect(pickActiveOrg([org('a'), org('b')], null)?.id).toBe('a');
  });

  it('honours what the user last chose', () => {
    const orgs = [org('home', { isPrimary: true }), org('xaviers')];
    expect(pickActiveOrg(orgs, 'xaviers')?.id).toBe('xaviers');
  });

  it('recovers when the stored college is no longer theirs', () => {
    // An operations lead whose portfolio was reassigned still has a stale id in
    // localStorage. Showing an empty app would look like a broken login.
    const orgs = [org('home', { isPrimary: true }), org('fergusson')];
    expect(pickActiveOrg(orgs, 'a-college-they-lost')?.id).toBe('home');
  });

  it('keeps working for the ordinary case of one membership', () => {
    expect(pickActiveOrg([org('only')], null)?.id).toBe('only');
    expect(pickActiveOrg([org('only')], 'stale')?.id).toBe('only');
  });
});

const mine = vi.fn();
vi.mock('./lms-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lms-api')>()),
  orgApi: { mine: () => mine() },
}));

/**
 * Two independent components, both asking which college is active.
 *
 * This is the shape the bug had: the switcher knew, and nothing else did. The
 * branding staying on the old college was the visible half; the dangerous half
 * is a header naming one college over a page still scoped to another.
 */
function Switcher() {
  const { orgs, setOrg } = useActiveOrg();
  return (
    <div>
      {orgs.map((o) => (
        <button key={o.id} onClick={() => setOrg(o.id)}>
          go {o.name}
        </button>
      ))}
    </div>
  );
}

function Elsewhere() {
  const { org } = useActiveOrg();
  return <span data-testid="elsewhere">{org?.name ?? 'none'}</span>;
}

describe('the choice is shared, not per-component', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    __resetActiveOrg();
    mine.mockResolvedValue([
      { id: 'a', name: 'St Xaviers', slug: 'sx', type: 'COLLEGE', isPrimary: true },
      { id: 'b', name: 'Bharati Vidyapeeth', slug: 'bv', type: 'COLLEGE' },
    ]);
  });

  it('moves every consumer when one of them switches college', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Switcher />
        <Elsewhere />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('elsewhere').textContent).toBe('St Xaviers'));
    fireEvent.click(await screen.findByText('go Bharati Vidyapeeth'));

    await waitFor(() =>
      expect(screen.getByTestId('elsewhere').textContent).toBe('Bharati Vidyapeeth'),
    );
  });

  it('remembers the choice for the next visit', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Switcher />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByText('go Bharati Vidyapeeth'));
    expect(window.localStorage.getItem('fca.activeOrgId')).toBe('b');
  });
});
