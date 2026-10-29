'use client';

import { useAui, useAuiState } from '@assistant-ui/react';
import { useEveAgentRuntime } from '@assistant-ui/eve';
import { useEffect, useState } from 'react';
import type { ClientSessionState } from 'eve/client';

import {
  EVE_HOST,
  isDeadSessionError,
  travelerHeaders,
} from '@/lib/nomito/eve-adapter';
import { getChat, patchChat } from '@/lib/nomito/chats';
import {
  getThreadInitialState,
  resolvePendingSession,
  updateCachedSession,
  updateCachedState,
} from '@/lib/nomito/thread-list';

/**
 * Per-thread runtime for the Nomito chat. Each assistant-ui thread binds one
 * durable eve session: the RemoteThreadList adapter (`thread-list.ts`) keeps
 * `chat_threads` rows in sync — `eve_session` is the resumable cursor and
 * `events` the cumulative stream prefix — while this hook feeds them to
 * `useEveAgentRuntime` at mount (`initialSession`/`initialEvents` only apply
 * then) and writes back on `onSessionChange`/`onFinish`.
 *
 * Also invoked once outside any thread scope by useRemoteThreadListRuntime —
 * hence `aui.optional.threadListItem` guards everywhere.
 */
/** Threads already repaired once — survives the remount it triggers. */
const repairedThreads = new Set<string>();

export function useNomitoThreadRuntime() {
  const aui = useAui();
  const remoteId = useAuiState((s) => s.optional.threadListItem?.remoteId);

  // One-shot: the mounted thread's persisted eve state. Sessions/events are
  // only read when the store is created, so a later cache update is moot.
  const [initial] = useState(() =>
    remoteId ? getThreadInitialState(remoteId) : {},
  );

  // Cache miss at mount: the thread body can mount before list()/fetch()
  // primed its eve state (deep-link on reload races the list, and remoteId
  // itself can resolve after the first render). Pull the row, prime the
  // cache, and remount so initialSession/initialEvents apply.
  useEffect(() => {
    if (!remoteId || repairedThreads.has(remoteId)) return;
    const cached = getThreadInitialState(remoteId);
    if (cached.session || cached.events?.length) return;
    repairedThreads.add(remoteId);
    void getChat(remoteId)
      .then((chat) => {
        updateCachedState(remoteId, {
          session: chat.eve_session.sessionId
            ? (chat.eve_session as ClientSessionState)
            : undefined,
          events: chat.events,
        });
        return aui.threads.reloadMainThread();
      })
      .catch(() => repairedThreads.delete(remoteId));
  }, [aui, remoteId]);

  return useEveAgentRuntime({
    host: EVE_HOST,
    headers: travelerHeaders,
    initialSession: initial.session,
    initialEvents: initial.events,
    resume: Boolean(initial.session?.sessionId),

    onSessionChange(session) {
      const item = aui.optional.threadListItem?.getState();
      if (!item) return;
      if (item.remoteId) {
        // Bound thread: keep the freshest cursor in memory, but only PATCH
        // when the session identity changes — the cursor advances per stream
        // event and would otherwise storm the API. The final cursor is
        // persisted with `events` on onFinish; on resume eve replays from 0
        // whenever the persisted pair diverges anyway.
        const previous = getThreadInitialState(item.remoteId).session;
        updateCachedSession(item.remoteId, session);
        if (session?.sessionId && session.sessionId !== previous?.sessionId) {
          void patchChat(item.remoteId, { eve_session: session }).catch(
            () => undefined,
          );
        }
      } else {
        // Draft thread: the pending initialize() awaits this session state.
        resolvePendingSession(item.id, session);
      }
    },

    onFinish(snapshot) {
      const remoteId = aui.optional.threadListItem?.getState().remoteId;
      if (!remoteId) return;
      const events = [...snapshot.events];
      updateCachedState(remoteId, { session: snapshot.session, events });
      void patchChat(remoteId, {
        eve_session: snapshot.session,
        events,
      }).catch(() => undefined);
    },

    onError(error) {
      // A stranded/deleted durable session can't be retried in place: clear
      // the stored binding and reload — the remount rehydrates the transcript
      // from `events` and lets the next send create a fresh session.
      if (!isDeadSessionError(error)) return;
      const remoteId = aui.optional.threadListItem?.getState().remoteId;
      if (remoteId) updateCachedSession(remoteId, undefined);
      const cleared = remoteId
        ? patchChat(remoteId, { eve_session: {} }).catch(() => undefined)
        : Promise.resolve();
      void cleared.finally(() => window.location.reload());
    },
  });
}
