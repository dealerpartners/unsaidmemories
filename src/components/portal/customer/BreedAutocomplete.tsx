'use client';

// ============================================================================
// BreedAutocomplete — the breed field for customer pet forms, powered by
// the public.breeds catalogue (738 breeds) via /api/customer/breeds.
// Suggestions carry the breed RECORD (typical weight range, life span,
// group), so the picker shows what the breed is, not just its name.
// Typing filters suggestions; picking one records the breed id alongside
// the name. Free text is always allowed (a mix that isn't catalogued is
// still a valid answer) — unmatched text clears the id. `species` scopes
// the catalogue when the surface knows it (dog wizard, cat picker) —
// the breed is never guessed at from the name alone.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface BreedSuggestion {
  id: string;
  name: string;
  species: string | null;
  breedGroup: string | null;
  lifeSpan?: string | null;
  weightRangeLbs?: { min: number; max: number } | null;
}

export function BreedAutocomplete({
  id,
  value,
  breedId,
  onChange,
  placeholder,
  className,
  species,
}: {
  id: string;
  value: string;
  breedId: string | null;
  onChange: (breedName: string, breedId: string | null) => void;
  placeholder?: string;
  className?: string;
  species?: 'dog' | 'cat' | null;
}) {
  const [suggestions, setSuggestions] = useState<BreedSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      const sp = species ? `&species=${species}` : '';
      fetch(`/api/customer/breeds?q=${encodeURIComponent(q.trim())}${sp}`)
        .then((r) => (r.ok ? r.json() : { breeds: [] }))
        .then((d) => {
          const list = (d.breeds ?? []) as BreedSuggestion[];
          setSuggestions(list);
          setHighlight(0);
          setOpen(list.length > 0);
        })
        .catch(() => setSuggestions([]));
    }, 200);
  };

  const pick = (b: BreedSuggestion) => {
    onChange(b.name, b.id);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open && suggestions[highlight] ? `${id}-opt-${suggestions[highlight].id}` : undefined}
        onChange={(e) => {
          const next = e.target.value;
          // Typing over a picked breed un-picks it: the id only stands
          // while the text is exactly the catalogued name.
          const stillPicked =
            breedId != null &&
            suggestions.some((s) => s.id === breedId && s.name === next);
          onChange(next, stillPicked ? breedId : null);
          search(next);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(suggestions[highlight]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {suggestions.map((b, i) => (
            <li key={b.id}>
              <button
                type="button"
                id={`${id}-opt-${b.id}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(b);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px]',
                  i === highlight ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                <span className="font-medium">{b.name}</span>
                <span className="shrink-0 text-[11px] capitalize text-muted-foreground">
                  {[
                    b.species,
                    b.breedGroup,
                    b.weightRangeLbs
                      ? b.weightRangeLbs.min === b.weightRangeLbs.max
                        ? `~${b.weightRangeLbs.max} lb`
                        : `${b.weightRangeLbs.min}–${b.weightRangeLbs.max} lb`
                      : null,
                    b.lifeSpan ? `${b.lifeSpan} yrs` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
