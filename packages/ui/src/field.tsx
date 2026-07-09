import { forwardRef, type InputHTMLAttributes, useId } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-panel border bg-panel px-3.5 text-sm text-ink transition',
        'placeholder:text-faint',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        invalid ? 'border-danger' : 'border-hair',
        className,
      )}
      {...props}
    />
  );
});

export interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; invalid: boolean }) => React.ReactNode;
}

/** Label + control + error wrapper with accessible wiring. */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children({ id, invalid: Boolean(error) })}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
