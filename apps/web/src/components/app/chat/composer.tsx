'use client';

import { AuiIf, ComposerPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { useEffect, useRef, useState } from 'react';

import { filterSlashCommands, parseSlashToken, type SlashCommand } from '@/components/app/chat/slash-commands';
import { SlashMenu } from '@/components/app/chat/slash-menu';
import { focusRing } from '@/components/beautiful/focus';

/**
 * The chat composer: the vendored PromptBar's pill variant rebuilt on
 * ComposerPrimitive (Enter sends, Shift+Enter newlines, the run's Cancel
 * replaces Send while running). `/` opens the slash-command menu.
 */
export function Composer() {
  const aui = useAui();
  const draft = useAuiState((s) => s.composer.text);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const [active, setActive] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const token = dismissed ? null : parseSlashToken(draft);
  const menuOpen = token !== null;
  const rows = token ? filterSlashCommands(token.query) : [];

  /* typing re-arms the menu after Escape dismissed it */
  useEffect(() => {
    setDismissed(false);
  }, [draft]);

  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [menuOpen, token?.query]);

  const pick = (command: SlashCommand) => {
    const text = aui.composer.getState().text;
    const current = parseSlashToken(text);
    /* keep whatever came before the /token in the prompt */
    const prefix = current ? text.slice(0, current.start) : text;
    if (command.message && isRunning) {
      /* mid-run: leave the expanded command in the prompt to send next */
      aui.composer.setText(prefix + command.message);
    } else {
      aui.composer.setText(prefix);
      if (command.message) {
        aui.thread.append({ role: 'user', content: [{ type: 'text', text: command.message }] });
      }
    }
    setDismissed(false);
    inputRef.current?.focus();
  };

  return (
    <ComposerPrimitive.Root
      compact
      className="relative flex items-end gap-1 rounded-3xl border border-sand bg-white p-1.5 pl-4 shadow-sm ring-1 ring-sand transition-[border-color,border-radius] duration-150 focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25 data-[compact]:rounded-full"
    >
      {token && (
        <SlashMenu
          rows={rows}
          query={token.query}
          active={active}
          engaged={engaged}
          onHoverRow={(i) => {
            setActive(i);
            setEngaged(true);
          }}
          onLeave={() => setEngaged(false)}
          onPick={pick}
        />
      )}
      <ComposerPrimitive.Input
        ref={inputRef}
        rows={1}
        maxRows={6}
        placeholder="Contale a Nomito a dónde querés ir…"
        aria-label="Mensaje para Nomito"
        onKeyDown={(event) => {
          if (rows.length > 0) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setEngaged(true);
              setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
              return;
            }
            if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
              event.preventDefault();
              pick(rows[active] ?? rows[0]);
              return;
            }
          }
          if (event.key === 'Escape' && token) {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(true);
          }
        }}
        className="max-h-40 min-h-8 w-full min-w-0 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-muted/70"
      />
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send
          aria-label="Enviar"
          className={`${focusRing} flex size-8 shrink-0 items-center justify-center rounded-full bg-terra text-paper transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] disabled:bg-sand disabled:text-ink-muted`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel
          aria-label="Detener"
          className={`${focusRing} flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-colors duration-150 hover:bg-ink/85`}
        >
          <span aria-hidden="true" className="h-3 w-3 rounded-xs bg-current" />
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </ComposerPrimitive.Root>
  );
}
