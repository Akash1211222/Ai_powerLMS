'use client';

import { Building2, Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@fca/ui';
import { useActiveOrg } from '@/lib/use-active-org';

/**
 * Moves between the colleges a person belongs to.
 *
 * Renders nothing for the great majority who belong to one — a control with a
 * single option is noise. It appears for an operations lead, whose portfolio is
 * several colleges, and for the platform owner.
 */
export function OrgSwitcher() {
  const { org, orgs, setOrg } = useActiveOrg();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!org || orgs.length < 2) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-[230px] items-center gap-2 rounded-panel border border-[color:var(--fca-hair)] bg-[color:var(--fca-card)] px-3 py-1.5 text-sm font-semibold text-[color:var(--fca-ink)] transition hover:bg-[color:var(--fca-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Building2 className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{org.name}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 opacity-60 transition', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Switch organisation"
          className="absolute right-0 z-50 mt-2 max-h-[60vh] w-72 overflow-y-auto rounded-panel border border-[color:var(--fca-hair)] bg-[color:var(--fca-panel)] p-1 shadow-[var(--fca-shadow-card)] backdrop-blur"
        >
          {orgs.map((o) => {
            const active = o.id === org.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    if (!active) setOrg(o.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-panel px-3 py-2 text-left text-sm transition',
                    active
                      ? 'bg-[color:var(--fca-chip)] font-semibold text-[color:var(--fca-ink)]'
                      : 'text-[color:var(--fca-faint)] hover:bg-[color:var(--fca-soft)]',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.name}</span>
                    {o.type === 'INTERNAL' && (
                      <span className="text-[11px] uppercase tracking-wide opacity-70">
                        Our own academy
                      </span>
                    )}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
