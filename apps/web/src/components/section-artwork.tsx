'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@fca/ui';
import { sectionArtFromPath, type SectionArt, type SectionArtKey, SECTION_ART } from '@/lib/section-artwork';

/** Compact banner shown at the top of every section via app layout. */
export function SectionArtworkBanner({ className }: { className?: string }) {
  const pathname = usePathname();
  const art = sectionArtFromPath(pathname);
  if (!art) return null;

  // Detail routes keep a slim strip; list roots get the full card energy.
  const isDetail = pathname.split('/').filter(Boolean).length > 1;

  return (
    <aside
      className={cn(
        'relative mb-6 overflow-hidden rounded-card border border-hair bg-panel shadow-card',
        isDetail ? 'p-3 sm:p-4' : 'p-4 sm:p-5',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-grad-aqua opacity-20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-accent-400/20 blur-2xl" />
      <div className="relative flex items-center gap-4 sm:gap-6">
        <div className={cn('shrink-0', isDetail ? 'w-20 sm:w-24' : 'w-28 sm:w-36')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={art.src}
            alt=""
            className="att-mascot h-auto w-full object-contain drop-shadow-lg"
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-500">
            {art.eyebrow}
          </p>
          <h2 className={cn('font-display font-extrabold tracking-tight text-ink', isDetail ? 'text-lg' : 'text-xl sm:text-2xl')}>
            {art.title}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-faint">{art.blurb}</p>
        </div>
      </div>
    </aside>
  );
}

/** Full mascot panel for embedding inside a page grid (e.g. attendance). */
export function SectionArtworkPanel({
  section,
  className,
  titleOverride,
  blurbOverride,
}: {
  section: SectionArtKey;
  className?: string;
  titleOverride?: string;
  blurbOverride?: string;
}) {
  const art: SectionArt = SECTION_ART[section];
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-between overflow-hidden rounded-card border border-hair bg-gradient-to-b from-brand-50/80 via-panel to-accent-50/40 p-0 shadow-card',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(56,189,248,0.18),transparent_45%),radial-gradient(circle_at_20%_80%,rgba(249,115,22,0.16),transparent_40%)]" />
      <div className="relative w-full px-4 pt-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-500">{art.eyebrow}</p>
        <h2 className="font-display text-lg font-bold">{titleOverride ?? art.title}</h2>
        <p className="mt-1 text-sm text-faint">{blurbOverride ?? art.blurb}</p>
      </div>
      <div className="relative flex w-full flex-1 items-end justify-center px-2 pb-3 pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={art.src}
          alt={art.alt}
          className="att-mascot h-[200px] w-auto max-w-full object-contain drop-shadow-xl"
        />
      </div>
    </div>
  );
}
