import type { LucideIcon } from 'lucide-react';
import { Card, cn } from '@fca/ui';

export type StatAccent = 'violet' | 'pink' | 'aqua' | 'amber' | 'mint';

const accents: Record<StatAccent, { icon: string; bar: string }> = {
  violet: { icon: 'bg-grad-brand shadow-glow', bar: 'bg-grad-brand' },
  pink: { icon: 'bg-grad-sunset shadow-glow-pink', bar: 'bg-grad-sunset' },
  aqua: { icon: 'bg-grad-aqua shadow-glow-aqua', bar: 'bg-grad-aqua' },
  amber: { icon: 'bg-grad-sunset shadow-glow-pink', bar: 'bg-grad-sunset' },
  mint: { icon: 'bg-grad-mint shadow-glow-aqua', bar: 'bg-grad-mint' },
};

const ACCENT_CYCLE: StatAccent[] = ['violet', 'pink', 'aqua', 'mint'];

/** Pick a stable accent for the i-th tile in a row. */
export function accentAt(i: number): StatAccent {
  return ACCENT_CYCLE[i % ACCENT_CYCLE.length]!;
}

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'violet',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  accent?: StatAccent;
}) {
  const a = accents[accent];
  return (
    <Card className="relative overflow-hidden p-4">
      <span className={cn('absolute inset-x-0 top-0 h-1', a.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-faint">{label}</div>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
            {value}
          </div>
          {sub && <div className="mt-0.5 truncate text-xs text-faint">{sub}</div>}
        </div>
        {Icon && (
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-panel text-white',
              a.icon,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
    </Card>
  );
}

/** Thin progress bar in the holographic ramp. */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-track">
      <div
        className="h-full rounded-full bg-grad-holo transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
