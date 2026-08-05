import { type HTMLAttributes } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-soft text-faint ring-1 ring-inset ring-hair dark:bg-chip dark:text-ink/80',
  brand:
    'bg-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-400/15 dark:text-brand-300 dark:ring-brand-400/30',
  success:
    'bg-success/15 text-success ring-1 ring-inset ring-success/25 dark:bg-success/20 dark:text-success dark:ring-success/35',
  warning:
    'bg-warning/15 text-amber-700 ring-1 ring-inset ring-warning/30 dark:bg-warning/20 dark:text-amber-300 dark:ring-warning/40',
  danger:
    'bg-danger/10 text-danger ring-1 ring-inset ring-danger/25 dark:bg-danger/20 dark:text-red-300 dark:ring-danger/35',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Maps a domain status string to a sensible badge tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'PUBLISHED':
    case 'ACTIVE':
    case 'COMPLETED':
      return 'success';
    case 'DRAFT':
    case 'PLANNED':
      return 'brand';
    case 'ARCHIVED':
    case 'CANCELLED':
    case 'REMOVED':
    case 'DROPPED':
      return 'danger';
    default:
      return 'neutral';
  }
}
