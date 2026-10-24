'use client';

import { useEffect, useState } from 'react';
import { useAuiState } from '@assistant-ui/react';

import { traveler } from '@/lib/mock/traveler';
import { MONEDAS_SPENT_KEY } from '@/lib/nomito/tools';

/**
 * Monedas Nomai left: the real ledger balance (GET /api/credits → sum(amount))
 * minus this session's spends not yet settled into a fresh fetch. Falls back
 * to the mock starting balance when unauthenticated or the api is unreachable.
 */
export function useMonedas(): number {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/credits')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { balance?: number } | null) => {
        if (typeof data?.balance === 'number') setBalance(data.balance);
      })
      .catch(() => null);
  }, []);

  const spent = useAuiState((s) =>
    s.thread.messages.reduce((sum, m) => {
      const v = m.role === 'assistant' ? m.metadata?.custom?.[MONEDAS_SPENT_KEY] : undefined;
      return sum + (typeof v === 'number' ? v : 0);
    }, 0),
  );

  return Math.max(0, (balance ?? traveler.monedas) - spent);
}
