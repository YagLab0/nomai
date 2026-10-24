'use client';

import { useEffect, useState } from 'react';

import { FALLBACK_USD_RATES, type FxRates } from '@/lib/lodgings';

/** Live fiat-per-USD rates; /api/fx resolves live sources, then a static table. */
export function useFxRates(): { rates: FxRates; source: string | null } {
  const [rates, setRates] = useState<FxRates>(FALLBACK_USD_RATES);
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/fx')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.rates) {
          setRates(body.rates);
          setSource(body.source ?? null);
        }
      })
      .catch(() => {});
  }, []);
  return { rates, source };
}
