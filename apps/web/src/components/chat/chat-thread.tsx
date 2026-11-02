'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, TextArea } from '@heroui/react';

import type { ApiChatMessage, ApiChatThread } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';

/**
 * Fallback cadence — the live path is the Supabase Realtime subscription on
 * `booking_messages` (ADR-0009); the poll stays as the safety net in case the
 * channel drops or Realtime isn't configured on the project.
 */
const POLL_MS = 15_000;

/** '2026-11-12T18:30:00Z' → '18:30' in the user's locale. */
const timeStamp = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** POST failures → a line the sender can act on. */
function sendErrorFor(status: number, code?: string): string {
  if (code === 'empty_body' || status === 400) return 'Escribí algo antes de enviar.';
  if (status === 403) return 'No podés escribir en este chat.';
  if (status === 404) return 'No encontramos esta reserva.';
  return 'No pudimos enviar el mensaje — probá de nuevo.';
}

/**
 * The private Traveler↔Owner thread of one Booking (ADR-0009). Bubbles: own
 * messages to the right in terra, the other side's to the left in white and
 * nomai's 'system' notes centered and muted. A "Visto" hint sits under the
 * last own message once the counterpart read it. The composer POSTs {body}
 * to the same proxy `endpoint` the thread GETs — on mount, every POLL_MS
 * and after each send.
 */
export function ChatThread({
  endpoint,
  bookingId,
  emptyHint = 'Todavía no hay mensajes — decile algo.',
}: {
  /** Proxy base: GET lists the thread, POST appends — e.g. `/api/bookings/<id>/messages`. */
  endpoint: string;
  /** The Booking the thread hangs off — scopes the Realtime subscription. */
  bookingId: string;
  /** Line shown while the Booking has no messages yet. */
  emptyHint?: string;
}) {
  const [messages, setMessages] = useState<ApiChatMessage[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tailId = messages?.length ? messages[messages.length - 1].id : null;

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) {
        setUnreachable(true);
        return;
      }
      const data = (await res.json()) as ApiChatThread;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();

    // Live delivery: postgres_changes INSERTs on this Booking's thread. The
    // subscription carries the user's JWT, so booking_messages_party_read
    // scopes what arrives (ADR-0009) — a refetch keeps `mine`/`unread`
    // server-computed instead of guessing from the row payload.
    let unsubscribe: (() => void) | null = null;
    if (hasSupabaseEnv) {
      const supabase = createClient();
      const channel = supabase
        .channel(`booking-chat-${bookingId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'booking_messages',
            filter: `booking_id=eq.${bookingId}`,
          },
          () => void load(),
        )
        .subscribe();
      unsubscribe = () => void supabase.removeChannel(channel);
    }

    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, [load, bookingId]);

  // Keep the newest message in view — first paint and every new tail (not on
  // every poll, so a reader scrolled up isn't yanked down each cycle).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tailId]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSendError(sendErrorFor(res.status, data.error));
        return;
      }
      setDraft('');
      await load();
    } catch {
      setSendError('No pudimos enviar el mensaje — probá de nuevo.');
    } finally {
      setSending(false);
    }
  }

  // The "Visto" hint belongs under the last message the caller sent.
  const lastMine = messages ? [...messages].reverse().find((m) => m.mine) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        ref={listRef}
        aria-live="polite"
        aria-label="Mensajes"
        className="flex max-h-80 min-h-48 flex-col gap-2 overflow-y-auto rounded-2xl border border-sand bg-paper/60 p-3"
      >
        {messages === null ? (
          unreachable ? (
            <p className="m-auto px-4 text-center text-xs text-ink-muted">
              No pudimos cargar los mensajes — seguimos reintentando.
            </p>
          ) : (
            <div className="m-auto flex items-center gap-2 text-ink-muted">
              <Spinner size="sm" color="current" />
              <span className="text-xs">Cargando mensajes…</span>
            </div>
          )
        ) : messages.length === 0 ? (
          <p className="m-auto px-4 text-center text-xs text-ink-muted">{emptyHint}</p>
        ) : (
          messages.map((m) =>
            m.sender_role === 'system' ? (
              <p
                key={m.id}
                className="self-center px-4 text-center text-xs italic text-ink-muted"
              >
                {m.body}
              </p>
            ) : (
              <div
                key={m.id}
                className={`flex max-w-[85%] flex-col rounded-2xl px-3.5 py-2 text-sm ${
                  m.mine
                    ? 'self-end rounded-br-md bg-terra-soft text-ink'
                    : 'self-start rounded-bl-md border border-sand bg-white text-ink'
                }`}
              >
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                <span
                  className={`mt-0.5 self-end text-[10px] ${
                    m.mine ? 'text-terra-deep/70' : 'text-ink-muted'
                  }`}
                >
                  {timeStamp(m.created_at)}
                </span>
              </div>
            ),
          )
        )}
        {lastMine?.read_at ? (
          <p className="self-end text-[11px] leading-none text-ink-muted">Visto</p>
        ) : null}
      </div>

      {sendError && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          {sendError}
        </p>
      )}

      <div className="flex items-end gap-2">
        <TextArea
          aria-label="Escribí tu mensaje"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={1}
          fullWidth
          placeholder="Decile algo…"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          className="max-h-28 resize-none rounded-2xl"
        />
        <Button
          isIconOnly
          aria-label="Enviar mensaje"
          isDisabled={!draft.trim() || sending}
          isPending={sending}
          onPress={() => void send()}
          className="size-10 shrink-0 rounded-full bg-terra text-white transition-colors disabled:bg-sand disabled:text-ink-muted"
        >
          {({ isPending }) =>
            isPending ? (
              <Spinner color="current" size="sm" />
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )
          }
        </Button>
      </div>
    </div>
  );
}
