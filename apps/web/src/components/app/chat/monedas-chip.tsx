'use client';

import { useAuiState } from '@assistant-ui/react';

import { MONEDAS_SPENT_KEY } from '@/lib/nomito/tools';

/** "−3 monedas", shown after the fact on a message that ran a search. */
export function MonedasChip() {
  const spent = useAuiState((s) => s.message.metadata?.custom?.[MONEDAS_SPENT_KEY]);
  if (typeof spent !== 'number' || spent <= 0) return null;
  return (
    <span className="mt-2 inline-flex w-fit items-center rounded-full bg-terra-soft px-2.5 py-0.5 font-mono text-xs text-terra-deep">
      −{spent} monedas
    </span>
  );
}
