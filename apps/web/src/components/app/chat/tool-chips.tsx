'use client';

import { useAuiState } from '@assistant-ui/react';
import { useState } from 'react';

import { focusRing } from '@/components/beautiful/focus';
import ToolChips, { type ToolStep } from '@/components/beautiful/ToolChips';
import { readToolStatus, TOOL_STATUS_KEY } from '@/lib/nomito/tool-status';
import type { ToolStatusEntry } from '@/lib/nomito/tool-status';

/** Tool name → vendored row glyph (think / write / run / read). Metadata only. */
const TOOL_ICONS: Record<string, string> = {
  check_balance: 'read',
  check_wallet: 'read',
  search_listings: 'read',
  get_listing: 'read',
  list_bookings: 'read',
  get_booking: 'read',
  quote_booking: 'run',
  book_listing: 'run',
  pay_endpoint: 'run',
  cancel_booking: 'run',
  open_claim: 'write',
};

function toStep(tool: ToolStatusEntry): ToolStep {
  return {
    id: tool.callId,
    icon: (tool.name && TOOL_ICONS[tool.name]) || 'run',
    label: tool.label,
    chip: tool.done ? 'listo' : 'en curso…',
    mono: false,
    detailMono: false,
    detail: [
      { text: tool.done ? 'Completada' : 'En curso…', ...(tool.done && { tone: 'add' as const }) },
    ],
  };
}

function usedHeader(count: number): string {
  return `${count} herramienta${count === 1 ? '' : 's'} usada${count === 1 ? '' : 's'}`;
}

/**
 * Tool calls as compact chips, folded from the eve stream into
 * `metadata.custom[TOOL_STATUS_KEY]`. While the turn runs the vendored
 * ToolChips lists them in flight; once it settles the block collapses to a
 * quiet "N herramientas usadas" that expands back into the full list.
 */
export function ToolRunChips() {
  const running = useAuiState(
    (s) => s.message.role === 'assistant' && s.message.status?.type === 'running',
  );
  const raw = useAuiState((s) => s.message.metadata.custom?.[TOOL_STATUS_KEY]);
  const [expanded, setExpanded] = useState(false);
  const tools = readToolStatus(raw);
  if (tools.length === 0) return null;

  if (!running && !expanded) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setExpanded(true)}
        className={`${focusRing} -mx-1.5 flex w-fit items-center gap-1.5 rounded-full px-1.5 py-1
          text-[12.5px] text-ink-muted transition-colors duration-100 hover:bg-sand/40`}
      >
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: 'rotate(-90deg)' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="tabular-nums">{usedHeader(tools.length)}</span>
      </button>
    );
  }

  return (
    <ToolChips
      steps={tools.map(toStep)}
      diffs={[]}
      diffLines={{}}
      labels={{ header: running ? 'Usando herramientas' : usedHeader(tools.length), more: '' }}
      /* min-h-0! drops the gallery's 220px floor; the hidden strip is the
         file-diff footer, unused — the Agent edits no files. */
      className="min-h-0! [&_.mt-2\.5]:hidden"
    />
  );
}
