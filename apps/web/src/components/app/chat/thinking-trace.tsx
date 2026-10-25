'use client';

import { useAuiState } from '@assistant-ui/react';
import { useEffect, useRef, useState } from 'react';

import ThinkingState from '@/components/beautiful/ThinkingState';
import { readTrace, TRACE_KEY } from '@/lib/nomito/trace';

/**
 * The Agent's thinking trace for this message, folded from the eve stream's
 * `step.*` / `reasoning.*` events into `metadata.custom[TRACE_KEY]`. Renders
 * the vendored ThinkingState block: it expands while the turn runs, then
 * settles into a collapsed "Pensó durante N segundos".
 */
export function ThinkingTrace() {
  const running = useAuiState(
    (s) => s.message.role === 'assistant' && s.message.status?.type === 'running',
  );
  const raw = useAuiState((s) => s.message.metadata.custom?.[TRACE_KEY]);

  // Wall-clock think time for the settled label. A resumed/old message mounts
  // already finished (running never observed) — then keep a bare "Pensó".
  const startRef = useRef(0);
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  if (running && startRef.current === 0) startRef.current = Date.now();
  useEffect(() => {
    if (running || doneLabel !== null) return;
    const start = startRef.current;
    if (start === 0) {
      setDoneLabel('Pensó');
      return;
    }
    const secs = Math.max(1, Math.round((Date.now() - start) / 1000));
    setDoneLabel(`Pensó durante ${secs} segundo${secs === 1 ? '' : 's'}`);
  }, [running, doneLabel]);

  const rows = readTrace(raw)
    .filter((entry) => entry.label.length > 0)
    .map((entry) => ({ primary: entry.label }));
  if (rows.length === 0) return null;

  // The vendored block settles on its own timeline; while the turn is still
  // running past that point the `done` fallback keeps the header truthful.
  return (
    <ThinkingState
      variant="Steps"
      rows={rows}
      active="Pensando"
      done={doneLabel ?? 'Pensando'}
    />
  );
}
