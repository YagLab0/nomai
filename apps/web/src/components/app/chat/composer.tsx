'use client';

import { AuiIf, ComposerPrimitive } from '@assistant-ui/react';

export function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 rounded-3xl border border-sand bg-white p-2 pl-4 shadow-sm focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
      <ComposerPrimitive.Input
        rows={1}
        maxRows={6}
        placeholder="Contale a Nomito a dónde querés ir…"
        aria-label="Mensaje para Nomito"
        className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-ink outline-none placeholder:text-ink-muted"
      />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terra text-paper transition-colors hover:bg-terra-deep disabled:bg-sand disabled:text-ink-muted"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel
          aria-label="Detener"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper hover:bg-ink/85"
        >
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-xs bg-current" />
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
}
