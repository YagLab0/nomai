'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuiState } from '@assistant-ui/react';

import { traveler } from '@/lib/mock/traveler';
import { MONEDAS_SPENT_KEY } from '@/lib/nomito/tools';

/**
 * Monedas Nomai left: the real ledger balance (GET /api/credits → sum(amount))
 * minus this session's spends the last fetch hadn't settled yet — a refetch
 * snapshots how much spend metadata was already folded into it, so a spend
 * mid-turn never double-counts. Falls back to the mock starting balance when
 * unauthenticated or the api is unreachable.
 */
export function useMonedas(): number {
  const sessionSpent = useAuiState((s) =>
    s.thread.messages.reduce((sum, m) => {
      const v = m.role === 'assistant' ? m.metadata?.custom?.[MONEDAS_SPENT_KEY] : undefined;
      return sum + (typeof v === 'number' ? v : 0);
    }, 0),
  );
  // Refetch when a turn settles and when a message lands — cheap, and the
  // ledger is only written while the agent runs anyway.
  const pulse = useAuiState((s) => `${s.thread.messages.length}:${s.thread.isRunning}`);

  const spentRef = useRef(sessionSpent);
  spentRef.current = sessionSpent;
  const [server, setServer] = useState<{ balance: number; spentAtFetch: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { balance?: number } | null) => {
        if (!cancelled && typeof data?.balance === 'number') {
          setServer({ balance: data.balance, spentAtFetch: spentRef.current });
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [pulse]);

  const base = server ? server.balance : traveler.monedas;
  const unsettled = sessionSpent - (server?.spentAtFetch ?? 0);
  return Math.max(0, Math.round((base - unsettled) * 100) / 100);
}
