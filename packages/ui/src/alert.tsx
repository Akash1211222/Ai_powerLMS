import { type HTMLAttributes } from 'react';
import { cn } from './cn';

type Tone = 'error' | 'success' | 'info';

const tones: Record<Tone, string> = {
  error: 'bg-danger/10 text-danger border-danger/25 backdrop-blur-md dark:bg-danger/15 dark:text-red-300 dark:border-danger/35',
  success:
    'bg-success/10 text-success border-success/25 backdrop-blur-md dark:bg-success/15 dark:text-emerald-300 dark:border-success/35',
  info: 'bg-brand-100/80 text-brand-700 border-brand-200 backdrop-blur-md dark:bg-brand-400/15 dark:text-brand-300 dark:border-brand-400/30',
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Alert({ tone = 'info', className, children, ...props }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-panel border px-3.5 py-2.5 text-sm', tones[tone], className)}
      {...props}
    >
      {children}
    </div>
  );
}
