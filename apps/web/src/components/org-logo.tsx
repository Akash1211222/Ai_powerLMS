'use client';

import Image from 'next/image';
import { Logo } from '@fca/ui';
import { useActiveOrg } from '@/lib/use-active-org';

/**
 * The college's own logo where ours would be, when they have supplied one.
 *
 * Falls back to the product logo — which is what our own academy and any
 * unbranded college should show — so a missing or broken image is a normal
 * state rather than a hole in the sidebar.
 */
export function OrgLogo() {
  const { org } = useActiveOrg();
  const src = org?.logoUrl;
  if (!src) return <Logo />;

  const label = org?.displayName || org?.name || 'College';
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
