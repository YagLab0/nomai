'use client';

import { useAuiState } from '@assistant-ui/react';

import LoadingState from '@/components/beautiful/LoadingState';

/**
 * Pixel loader + elapsed clock shown while the turn awaits its first text —
 * tool calls and model steps stay invisible, so the loader is the only
 * in-flight indicator and unmounts the moment anything streams.
 */
export function WaitingState() {
  const waiting = useAuiState((s) => {
    if (s.message.role !== 'assistant' || s.message.status?.type !== 'running') return false;
    return !s.message.content.some(
      (part) => part.type === 'text' && part.text.trim().length > 0,
    );
  });
  if (!waiting) return null;

  return <LoadingState label="Pensando" />;
}
