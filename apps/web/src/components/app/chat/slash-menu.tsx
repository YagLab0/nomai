'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { focusRing } from '@/components/beautiful/focus';
import '@/components/beautiful/styles.css';
import type { SlashCommand } from '@/components/app/chat/slash-commands';

/**
 * The `/` command menu, ported from the vendored PromptBar: it anchors to
 * the composer's top edge, pops in, and a single highlight glides to the
 * active row instead of each row toggling its own background.
 */
export function SlashMenu({
  rows,
  query,
  active,
  engaged,
  onHoverRow,
  onLeave,
  onPick,
}: {
  rows: readonly SlashCommand[];
  query: string;
  active: number;
  /** highlight only appears once the pointer or the arrows engage a row */
  engaged: boolean;
  onHoverRow: (index: number) => void;
  onLeave: () => void;
  onPick: (command: SlashCommand) => void;
}) {
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rowBox, setRowBox] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [active, rows.length]);

  return (
    <div
      role="listbox"
      aria-label="Comandos"
      onMouseLeave={onLeave}
      className="absolute inset-x-0 bottom-full z-10 mb-2 rounded-2xl bg-white p-1 shadow-md ring-1 ring-sand"
      style={{ animation: 'bui-pop-in 180ms cubic-bezier(0.23,1,0.32,1) both', transformOrigin: 'bottom center' }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-1 rounded-xl bg-sand/50"
        style={{
          top: rowBox?.top ?? 0,
          height: rowBox?.height ?? 0,
          opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
          transition:
            'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease',
        }}
      />
      {rows.map((row, i) => (
        <button
          key={row.key}
          type="button"
          role="option"
          aria-selected={i === active}
          ref={(el) => {
            rowRefs.current[i] = el;
          }}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHoverRow(i)}
          onClick={() => onPick(row)}
          className={`${focusRing} relative z-10 flex h-9 w-full items-center gap-2.5 rounded-xl px-2 text-left`}
        >
          <span className="shrink-0 text-[12.5px] font-medium text-ink">{row.name}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{row.desc}</span>
        </button>
      ))}
      {rows.length === 0 && (
        <div className="flex h-9 items-center px-2 text-[12px] text-ink-muted">
          Sin resultados para “{query}”
        </div>
      )}
      <div className="mt-1 border-t border-sand px-2 pb-1 pt-1.5 text-[11px] text-ink-muted">
        Escribí para buscar comandos
      </div>
    </div>
  );
}
