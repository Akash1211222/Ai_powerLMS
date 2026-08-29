/**
 * The screen that opens a college.
 *
 * Two things matter enough to pin: that a college can be added with its
 * branding in one go, and that the list gives an unbranded college an identity
 * of its own rather than showing our logo for it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CollegesPanel } from './colleges-panel';

const organizations = vi.fn();
const createOrganization = vi.fn();

vi.mock('@/lib/lms-learning-api', () => ({
  adminApi: {
    organizations: () => organizations(),
    createOrganization: (input: unknown) => createOrganization(input),
  },
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const college = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: "St. Xavier's College, Mumbai",
  displayName: "St. Xavier's",
  slug: 'st-xaviers-college-mumbai',
  type: 'COLLEGE',
  status: 'ACTIVE',
  logoUrl: null,
  primaryColor: '#4a0e1a',
  memberCount: 3,
  batchCount: 1,
  ...over,
});

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CollegesPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  organizations.mockResolvedValue([college()]);
  createOrganization.mockResolvedValue({ id: 'c2', name: 'New College', slug: 'new-college' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CollegesPanel', () => {
  it('lists the colleges already on the platform', async () => {
    renderPanel();
    expect(await screen.findByText("St. Xavier's")).toBeTruthy();
    expect(screen.getByText(/3 members · 1 batch/)).toBeTruthy();
  });

  it('opens a college with its name and branding in one step', async () => {
    renderPanel();
    await screen.findByText("St. Xavier's");

    fill(/college name/i, 'New College');
    fill(/short name/i, 'NC');
    fill(/logo address/i, 'https://nc.test/logo.png');
    fill(/^theme colour$/i, '#1e3a8a');
    fireEvent.click(screen.getByRole('button', { name: /add college/i }));

    await waitFor(() =>
      expect(createOrganization).toHaveBeenCalledWith({
        name: 'New College',
        displayName: 'NC',
        logoUrl: 'https://nc.test/logo.png',
        primaryColor: '#1e3a8a',
      }),
    );
  });

  it('sends nothing rather than empty branding when the fields are left alone', async () => {
    // Branding is optional, and "" is not a colour. Sending empty strings would
    // fail validation for a college that simply has no logo yet.
    renderPanel();
    await screen.findByText("St. Xavier's");

    fill(/college name/i, 'Plain College');
    fireEvent.click(screen.getByRole('button', { name: /add college/i }));

    await waitFor(() =>
      expect(createOrganization).toHaveBeenCalledWith({
        name: 'Plain College',
        displayName: undefined,
        logoUrl: undefined,
        primaryColor: undefined,
      }),
    );
  });

  it('says what to do next, since a college alone cannot sign anyone in', async () => {
    renderPanel();
    await screen.findByText("St. Xavier's");

    fill(/college name/i, 'New College');
    fireEvent.click(screen.getByRole('button', { name: /add college/i }));

    expect(await screen.findByText(/New College added/)).toBeTruthy();
    expect(screen.getByText(/add a batch manager/i)).toBeTruthy();
  });

  it('will not submit a name too short to be a college', async () => {
    renderPanel();
    await screen.findByText("St. Xavier's");

    fill(/college name/i, 'A');
    expect(screen.getByRole('button', { name: /add college/i }).hasAttribute('disabled')).toBe(true);
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it('shows the college logo when there is one', async () => {
    organizations.mockResolvedValue([college({ logoUrl: 'https://x.test/l.png' })]);
    renderPanel();
    await waitFor(() =>
      expect(document.querySelector('img[src="https://x.test/l.png"]')).toBeTruthy(),
    );
  });

  it('gives an unbranded college its own initial, not our logo', async () => {
    // The header falls back to the product logo, which is right there and wrong
    // here — it would make every unbranded college look like the same row.
    organizations.mockResolvedValue([college({ logoUrl: null, displayName: 'Plain' })]);
    renderPanel();
    await screen.findByText('Plain');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('P')).toBeTruthy();
  });

  it('reports a refusal from the server instead of looking like it worked', async () => {
    createOrganization.mockRejectedValue(new Error('The logo address must start with https://'));
    renderPanel();
    await screen.findByText("St. Xavier's");

    fill(/college name/i, 'Bad College');
    fireEvent.click(screen.getByRole('button', { name: /add college/i }));

    expect(await screen.findByText(/must start with https/i)).toBeTruthy();
  });
});

describe('the initial shown for an unbranded college', () => {
  it('stays readable on a pale college colour', async () => {
    // A college can pick any colour they like, including one white text
    // disappears into. Nothing else would notice — the letter would simply
    // stop being visible.
    organizations.mockResolvedValue([
      college({ logoUrl: null, displayName: 'Pale', primaryColor: '#fff3b0' }),
    ]);
    renderPanel();
    const mark = await screen.findByText('P');
    expect((mark as HTMLElement).style.color).toBe('rgb(7, 14, 28)');
  });

  it('uses white on a dark college colour', async () => {
    organizations.mockResolvedValue([
      college({ logoUrl: null, displayName: 'Deep', primaryColor: '#4a0e1a' }),
    ]);
    renderPanel();
    const mark = await screen.findByText('D');
    expect((mark as HTMLElement).style.color).toBe('rgb(255, 255, 255)');
  });
});
