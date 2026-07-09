import { type HTMLAttributes } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-soft text-faint',
  brand: 'bg-brand-100 text-brand-600',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
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
