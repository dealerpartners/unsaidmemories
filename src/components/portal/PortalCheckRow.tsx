'use client';

// CheckSquareRow — a controlled square-checkbox row used by the portal's
// Communication Preferences page (and any future preference surface).

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CheckSquareRow({
  label,
  checked,
  onToggle,
  bold,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  bold?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors',
        checked ? 'border-gold-deep bg-amber-50/40' : 'border-ink/10 bg-white hover:border-ink/25',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 transition-colors',
          checked ? 'border-brand-teal bg-brand-teal' : 'border-neutral-300 bg-white',
        )}
      >
        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
      <span
        className={cn(
          'text-[14px] leading-snug',
          bold ? 'font-semibold text-ink' : 'text-ink-soft',
        )}
      >
        {label}
      </span>
    </button>
  );
}
