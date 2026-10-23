'use client';

import { useAuiState } from '@assistant-ui/react';

import { NomitoAvatar } from '@/components/nomito-avatar';
import { MONEDAS_SPENT_KEY } from '@/lib/nomito/tools';

export function ChatHeader() {
  const lastCost = useAuiState((s) => {
    for (let i = s.thread.messages.length - 1; i >= 0; i--) {
      const m = s.thread.messages[i];
      const v = m.role === 'assistant' ? m.metadata?.custom?.[MONEDAS_SPENT_KEY] : undefined;
      if (typeof v === 'number') return v;
    }
    return 0;
  });

  return (
    <header className="flex items-center gap-3 border-b border-sand bg-paper px-4 py-3">
      <NomitoAvatar size="md" shape="icon" />
      <div className="min-w-0 flex-1">
        <h1 className="font-brand text-lg font-medium leading-tight text-ink">Nomito</h1>
        <p className="truncate text-sm text-ink-muted">Te busca alojamiento en Latinoamérica</p>
      </div>
      {lastCost > 0 && (
        <span className="rounded-full bg-terra-soft px-2.5 py-1 font-mono text-xs text-terra-deep">
          última búsqueda −{lastCost} monedas
        </span>
      )}
    </header>
  );
}
