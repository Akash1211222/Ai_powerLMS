'use client';

import Image from 'next/image';
import { Logo } from '@fca/ui';
import { useActiveOrg } from '@/lib/use-active-org';

/**
 * Whose product this looks like, in the corner where a logo goes.
 *
 * A college that supplied a logo gets it. A college that has not — most of them
 * on day one — gets its own name set as a wordmark: falling back to *our* logo
 * would tell a student at St. Xavier's they had signed in to FutureCorp, which
 * is the one thing per-college branding exists to avoid. Our own academy, and
 * anything not yet identified, keeps the product logo, because there it is
 * correct.
 */
export function OrgLogo() {
  const { org } = useActiveOrg();
  const src = org?.logoUrl;
  const label = org?.displayName || org?.name || '';

  if (!src) {
    // INTERNAL is our own academy, where the product logo is the right answer.
    if (!org || org.type === 'INTERNAL' || !label) return <Logo />;
    return (
      <span
        className="font-display line-clamp-2 max-w-[160px] text-left text-base font-extrabold leading-tight tracking-tight"
        title={org.name}
      >
        {label}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={label}
      width={160}
      height={40}
      className="h-9 w-auto max-w-[160px] object-contain"
      // Supplied per college and served from wherever they host it, so it is
      // not something the build can optimise ahead of time.
      unoptimized
    />
  );
}
