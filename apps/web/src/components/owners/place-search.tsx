'use client';

import { useEffect, useRef, useState } from 'react';
import { Input, Label, TextField } from '@heroui/react';

import { searchPlaces, type Place } from '@/lib/geocode';

/**
 * The wizard's "Ciudad o pueblo" field: free geocoding scoped to the Owner's
 * country — any real place can be a Lodging's town, not just the listed ones.
 * Debounced, aborts stale searches, and reports a pick (or that the text moved
 * away from it) so the map below can unlock or lock again.
 */
export function PlaceSearch({
  countryCode,
  initialValue = '',
  onPick,
  onClear,
}: {
  countryCode: string;
  /** Edit mode: the Lodging's current town. */
  initialValue?: string;
  onPick: (place: Place) => void;
  /** The text moved away from the last pick — the choice no longer stands. */
  onClear: () => void;
}) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const picked = useRef<string | null>(initialValue || null);
  const box = useRef<HTMLDivElement>(null);

  // Debounced search; a newer keystroke aborts the request before it.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || picked.current === q) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    setFailed(false);
    setOpen(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(q, countryCode, ctrl.signal)
        .then(setResults)
        .catch(() => {
          if (!ctrl.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setBusy(false);
        });
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [query, countryCode]);

  // A click outside closes the dropdown.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function change(text: string) {
    setQuery(text);
    if (picked.current && picked.current !== text.trim()) {
      picked.current = null;
      onClear();
    }
  }

  function pick(p: Place) {
    picked.current = p.name;
    setQuery(p.name);
    setOpen(false);
    onPick(p);
  }

  const searching = query.trim().length >= 3 && picked.current !== query.trim();
  return (
    <div ref={box} className="relative">
      <TextField isRequired value={query} onChange={change}>
        <Label>Ciudad o pueblo</Label>
        <Input
          fullWidth
          placeholder="Buscá: Tilcara, Villa Traful…"
          autoComplete="off"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        />
      </TextField>
      {open && searching && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-sand bg-paper shadow-lg">
          {busy ? (
            <p className="px-3 py-2 text-sm text-ink-muted">Buscando…</p>
          ) : failed ? (
            <p className="px-3 py-2 text-sm text-ink-muted">No pudimos buscar. Probá de nuevo.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-muted">No encontramos ese lugar en tu país.</p>
          ) : (
            <ul role="listbox" aria-label="Lugares encontrados" className="max-h-48 overflow-auto py-1">
              {results.map((p) => (
                <li key={`${p.name}|${p.region ?? ''}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pick(p)}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-sand/60 focus-visible:bg-sand/60"
                  >
                    <span className="text-sm font-medium text-ink">{p.name}</span>
                    {p.region && <span className="text-xs text-ink-muted">{p.region}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
