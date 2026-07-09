import { cn } from './cn';

export interface LogoProps {
  withWordmark?: boolean;
  className?: string;
}

/** FutureCorp brand mark (matches the design mockups). */
export function Logo({ withWordmark = true, className }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-panel bg-gradient-to-br from-brand-400 to-brand-700 shadow-glow">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3 3 8l9 5 9-5-9-5Z" fill="#fff" />
          <path
            d="M6 11v4.5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5V11"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {withWordmark && (
        <span className="text-lg font-extrabold tracking-tight text-ink">FutureCorp</span>
      )}
    </div>
  );
}
