import { Card } from '@fca/ui';

export function StatTile({
  label,
  value,
  sub,
  icon,
  iconClass = 'bg-brand-100 text-brand-600',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  iconClass?: string;
}) {
  return (
    <Card className="p-4">
      {icon && (
        <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-panel ${iconClass}`}>
          {icon}
        </div>
      )}
      <div className="text-sm font-semibold text-faint">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </Card>
  );
}

/** Thin progress bar in the brand ramp. */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-track">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-700"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

/** Circular progress ring with a centered label (matches the design system). */
export function ProgressRing({
  percent,
  size = 132,
  label,
}: {
  percent: number;
  size?: number;
  label?: string;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, percent));
  const offset = c - (pct / 100) * c;
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="fill-none stroke-brand-500 transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-extrabold tracking-tight">{pct}%</span>
        {label && <span className="text-xs text-faint">{label}</span>}
      </div>
    </div>
  );
}
