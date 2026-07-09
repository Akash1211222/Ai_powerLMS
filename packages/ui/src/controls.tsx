import { forwardRef, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const base =
  'w-full rounded-panel border bg-panel px-3.5 text-sm text-ink transition placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(base, 'h-11', invalid ? 'border-danger' : 'border-hair', className)}
      {...props}
    >
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(base, 'min-h-[88px] py-2.5', invalid ? 'border-danger' : 'border-hair', className)}
      {...props}
    />
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent',
        className,
      )}
      aria-label="Loading"
    />
  );
}
