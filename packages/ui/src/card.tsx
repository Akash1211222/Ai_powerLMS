import { type HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Frosted glass panel — semi-transparent surface + backdrop blur over the
 * aurora backdrop, with a soft violet glow that deepens on hover.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-hair bg-card p-6 shadow-card',
        'backdrop-blur-xl backdrop-saturate-150',
        'transition-shadow duration-300 hover:shadow-card-hover',
        className,
      )}
      {...props}
    />
  );
}
