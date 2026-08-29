'use client';

import { brandCss } from '@/lib/brand-theme';
import { useActiveOrg } from '@/lib/use-active-org';

/**
 * Paints the active college's colour over our accent tokens.
 *
 * Renders nothing when the organisation has no colour set, which is the case
 * for our own academy and for any college that has not asked — they keep the
 * product's own look rather than getting a washed-out version of it.
 *
 * The value is a hex colour or it is dropped; see brand-theme.ts. It reaches a
 * stylesheet, so "it came from a customer" is the whole reason it is validated
 * rather than trusted.
 */
export function BrandThemeStyle() {
  const { org } = useActiveOrg();
  const css = brandCss(org?.primaryColor);
  if (!css) return null;
  return <style data-brand={org?.slug}>{css}</style>;
}
