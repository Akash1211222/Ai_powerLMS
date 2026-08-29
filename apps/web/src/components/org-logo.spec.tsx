/**
 * The corner of the screen that says whose product this is.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { OrgLogo } from './org-logo';

const org = vi.fn();
vi.mock('@/lib/use-active-org', () => ({ useActiveOrg: () => ({ org: org() }) }));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock('@fca/ui', () => ({ Logo: () => <div data-testid="product-logo" /> }));

const college = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  name: "St. Xavier's College, Mumbai",
  displayName: "St. Xavier's",
  slug: 's',
  type: 'COLLEGE',
  logoUrl: null,
  primaryColor: null,
  ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OrgLogo', () => {
  it('shows the college logo when they supplied one', () => {
    org.mockReturnValue(college({ logoUrl: 'https://x.test/l.png' }));
    render(<OrgLogo />);
    expect(screen.getByAltText("St. Xavier's").getAttribute('src')).toBe('https://x.test/l.png');
  });

  it('shows the college name when they have not', () => {
    // Falling back to our logo here would tell a student at St. Xavier's that
    // they had signed in to FutureCorp — the one thing branding exists to stop.
    org.mockReturnValue(college({ logoUrl: null }));
    render(<OrgLogo />);
    expect(screen.getByText("St. Xavier's")).toBeTruthy();
    expect(screen.queryByTestId('product-logo')).toBeNull();
  });

  it('keeps our own logo for our own academy', () => {
    org.mockReturnValue(college({ name: 'FutureCorp Academy', displayName: null, type: 'INTERNAL' }));
    render(<OrgLogo />);
    expect(screen.getByTestId('product-logo')).toBeTruthy();
  });

  it('keeps our own logo before an organisation is known', () => {
    org.mockReturnValue(null);
    render(<OrgLogo />);
    expect(screen.getByTestId('product-logo')).toBeTruthy();
  });
});
