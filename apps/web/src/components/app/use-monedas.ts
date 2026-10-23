'use client';

import { useAuiState } from '@assistant-ui/react';

import { traveler } from '@/lib/mock/traveler';
import { MONEDAS_SPENT_KEY } from '@/lib/nomito/tools';

/** Monedas Nomai left: mock starting balance minus what this session's searches cost. */
export function useMonedas(): number {
  const spent = useAuiState((s) =>
    s.thread.messages.reduce((sum, m) => {
      const v = m.role === 'assistant' ? m.metadata?.custom?.[MONEDAS_SPENT_KEY] : undefined;
      return sum + (typeof v === 'number' ? v : 0);
    }, 0),
  );
  return Math.max(0, traveler.monedas - spent);
}
