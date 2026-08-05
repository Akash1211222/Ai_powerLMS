import { cn } from './cn';

export interface LogoProps {
  withWordmark?: boolean;
  className?: string;
  /** Path to the shield mark asset (defaults to the web public brand mark). */
  markSrc?: string;
  /** Pixel height of the shield mark. */
  markSize?: number;
}

/** FutureCorp Academy brand mark — 3D shield + wordmark. */
export function Logo({
  withWordmark = true,
  className,
  markSrc = '/brand/futurecorp-mark.png',
  markSize = 40,
}: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- shared UI package; plain img is portable */}
      <img
        src={markSrc}
        alt=""
        width={markSize}
        height={Math.round(markSize * (460 / 500))}
        className="h-10 w-auto object-contain drop-shadow-[0_4px_12px_rgba(37,99,235,0.35)]"
        aria-hidden
      />
      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-lg font-bold tracking-tight text-ink">FutureCorp</span>
          <span className="text-[9px] font-bold tracking-[0.35em] text-faint">ACADEMY</span>
        </span>
      )}
    </div>
  );
}
