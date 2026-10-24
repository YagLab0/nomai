'use client';

import { useAuiState } from '@assistant-ui/react';

import { readToolStatus, TOOL_STATUS_KEY } from '@/lib/nomito/tool-status';

type ToolStatusItem = { label: string; done: boolean };

/** One item per label, in first-seen order; done only once every call with it is. */
function groupByLabel(raw: unknown): ToolStatusItem[] {
  const items = new Map<string, ToolStatusItem>();
  for (const { label, done } of readToolStatus(raw)) {
    const prev = items.get(label);
    items.set(label, { label, done: (prev?.done ?? true) && done });
  }
  return [...items.values()];
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 shrink-0">
      <path
        d="M2.5 6.5l2.25 2.25L9.5 3.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Live tool progress for the in-flight assistant message, e.g.
 * "Buscando alojamientos ✓ · Cotizando…". Shown only while the turn runs:
 * once it completes, errors or is cancelled the line disappears.
 */
export function ToolStatus() {
  const running = useAuiState(
    (s) => s.message.role === 'assistant' && s.message.status?.type === 'running',
  );
  // Select the raw stored reference (stable across renders), derive below.
  const raw = useAuiState((s) => s.message.metadata.custom?.[TOOL_STATUS_KEY]);
  if (!running) return null;

  const items = groupByLabel(raw);
  if (items.length === 0) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted"
    >
      {items.map((item, i) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden="true" className="text-sand">
              ·
            </span>
          )}
          {item.done ? (
            <span className="inline-flex items-center gap-1 opacity-70">
              {item.label}
              <CheckIcon />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-ink">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-terra motion-safe:animate-pulse"
              />
              {item.label}…
            </span>
          )}
        </span>
      ))}
    </p>
  );
}
