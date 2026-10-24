'use client';

import { useAuiState } from '@assistant-ui/react';

import LoadingState from '@/components/beautiful/LoadingState';
import { readToolStatus, TOOL_STATUS_KEY } from '@/lib/nomito/tool-status';
import { readTrace, TRACE_KEY } from '@/lib/nomito/trace';

/**
 * Pixel loader + elapsed clock shown only while the turn awaits its very
 * first stream event — no text, no tool call, no trace step yet. The moment
 * anything streams it hands off to the trace / chips / text and unmounts.
 */
export function WaitingState() {
  const waiting = useAuiState((s) => {
    if (s.message.role !== 'assistant' || s.message.status?.type !== 'running') return false;
    const hasText = s.message.content.some(
      (part) => part.type === 'text' && part.text.trim().length > 0,
    );
    if (hasText) return false;
    const { custom } = s.message.metadata;
    return (
      readToolStatus(custom?.[TOOL_STATUS_KEY]).length === 0 &&
      readTrace(custom?.[TRACE_KEY]).length === 0
    );
  });
  if (!waiting) return null;

  return <LoadingState label="Pensando" />;
}
