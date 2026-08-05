'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@fca/ui';

const TICKS = [
  'Booting your cockpit…',
  'Syncing learning signals…',
  'Lighting the constellation…',
  'Almost ready…',
];

/** Native mark size after chromakey crop (shield + arrow). */
const MARK_W = 500;
const MARK_H = 460;

/**
 * Full-bleed FutureCorp loading stage — brand mark + holographic rings.
 */
export function BrandLoader({
  message,
  className,
  compact = false,
}: {
  message?: string;
  className?: string;
  compact?: boolean;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (message) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % TICKS.length), 1600);
    return () => window.clearInterval(id);
  }, [message]);

  const copy = message ?? TICKS[tick]!;
  const displayW = compact ? 112 : 200;
  const displayH = Math.round(displayW * (MARK_H / MARK_W));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'fca-loader relative flex flex-col items-center justify-center overflow-hidden',
        compact ? 'min-h-[240px] w-full rounded-card' : 'min-h-screen w-full',
        className,
      )}
    >
      <div className="fca-loader-bg absolute inset-0" aria-hidden />
      <div className="fca-loader-grid absolute inset-0" aria-hidden />
      <div className="fca-loader-orb fca-loader-orb-a absolute -left-24 top-1/4 h-64 w-64 rounded-full" aria-hidden />
      <div className="fca-loader-orb fca-loader-orb-b absolute -right-20 bottom-1/4 h-72 w-72 rounded-full" aria-hidden />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        <div
          className={cn(
            'relative flex items-center justify-center',
            compact ? 'h-40 w-40' : 'h-64 w-64 sm:h-72 sm:w-72',
          )}
        >
          {/* Soft halo behind mark — not a hard plate */}
          <div className="fca-loader-halo absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full" aria-hidden />

          <div className="fca-loader-ring absolute inset-[4%] rounded-full opacity-80" aria-hidden />
          <div className="fca-loader-ring fca-loader-ring-2 absolute inset-[14%] rounded-full opacity-70" aria-hidden />

          <div className="fca-loader-orbit absolute inset-[4%]" aria-hidden>
            <span className="fca-loader-spark absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-accent-400" />
          </div>
          <div className="fca-loader-orbit fca-loader-orbit-rev absolute inset-[14%]" aria-hidden>
            <span className="fca-loader-spark fca-loader-spark-sky absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-sky-400" />
          </div>

          <div className="fca-loader-mark relative z-10">
            <Image
              src="/brand/futurecorp-mark.png"
              alt="FutureCorp Academy"
              width={MARK_W}
              height={MARK_H}
              priority
              unoptimized
              className="relative select-none object-contain"
              style={{ width: displayW, height: displayH }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="font-display text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            FutureCorp <span className="text-accent-400">Academy</span>
          </div>
          <p key={copy} className="fca-loader-copy max-w-xs text-sm font-semibold text-white/70">
            {copy}
          </p>
        </div>

        <div className="fca-loader-track h-1 w-40 overflow-hidden rounded-full bg-white/10 sm:w-52">
          <div className="fca-loader-bar h-full w-1/2 rounded-full bg-grad-sunset" />
        </div>
      </div>

      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Compact inline loader for page sections. */
export function InlineLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status" aria-busy="true">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="fca-loader-ring absolute inset-0 rounded-full !border-brand-400/30" aria-hidden />
        <Image
          src="/brand/futurecorp-mark.png"
          alt=""
          width={44}
          height={40}
          unoptimized
          className="relative object-contain"
        />
      </div>
      <p className="text-sm font-semibold text-faint">{label}</p>
    </div>
  );
}
