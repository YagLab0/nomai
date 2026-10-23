'use client';

import { WidgetCard } from '@/components/app/widget-card';
import { traveler } from '@/lib/mock/traveler';

export function BusquedasCard() {
  return (
    <WidgetCard title="Búsquedas recientes">
      <ul className="-mx-2 flex flex-col">
        {traveler.recentSearches.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-paper focus-visible:outline-2 focus-visible:outline-terra"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-ink">{s.title}</span>
                <span className="block text-xs text-ink-muted">{s.date}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-muted">−{s.monedas}</span>
            </button>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
