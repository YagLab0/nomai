import type {
  RemoteThreadInitializeResponse,
  RemoteThreadListAdapter,
  RemoteThreadMetadata,
  RemoteThreadListResponse,
  ThreadMessage,
} from '@assistant-ui/core';
import { createAssistantStream } from 'assistant-stream';
import type { ClientSessionState, MessageStreamEvent } from 'eve/client';

import {
  createChat,
  deleteChat,
  getChat,
  listChats,
  patchChat,
} from '@/lib/nomito/chats';
import { FORM_VALUES_MARKER } from '@/components/app/chat/openui-text';

/**
 * RemoteThreadListAdapter backed by `/api/chats` (Supabase `chat_threads`).
 *
 * Each persisted thread maps 1:1 to a durable eve session: `eve_session`
 * holds the resumable {sessionId, streamIndex} cursor and `events` the
 * cumulative stream prefix that rehydrates the transcript. The runtime hook
 * (nomito-runtime.ts) reads both through `threadCache` at mount — the cache
 * is primed here by list()/fetch()/initialize() so `initialSession` and
 * `initialEvents` are ready before `useEveAgentRuntime` creates its store
 * (those options only apply at mount).
 */

export interface ThreadInitialState {
  session?: ClientSessionState;
  events?: MessageStreamEvent[];
}

const threadCache = new Map<string, ThreadInitialState>();

/** Read the cached eve state for a thread (called once at runtime mount). */
export function getThreadInitialState(remoteId: string): ThreadInitialState {
  return threadCache.get(remoteId) ?? {};
}

export function updateCachedSession(
  remoteId: string,
  session: ClientSessionState | undefined,
): void {
  threadCache.set(remoteId, { ...threadCache.get(remoteId), session });
}

export function updateCachedState(remoteId: string, state: ThreadInitialState): void {
  threadCache.set(remoteId, state);
}

export function dropCachedState(remoteId: string): void {
  threadCache.delete(remoteId);
}

/**
 * First-turn handshake: the RemoteThreadList auto-initializes a draft thread
 * on its first send while eve is concurrently creating the durable session.
 * `initialize()` awaits the session state that `onSessionChange` resolves
 * here — with a timeout fallback so a store that never fires doesn't wedge
 * thread creation.
 */
const pendingSessions = new Map<
  string,
  { promise: Promise<ClientSessionState | undefined>; resolve: (s: ClientSessionState | undefined) => void }
>();

/** In-flight initialize() calls — see the dedupe comment in initialize. */
const initializing = new Map<string, Promise<RemoteThreadInitializeResponse>>();

const SESSION_WAIT_MS = 10_000;

export function resolvePendingSession(
  threadId: string,
  session: ClientSessionState | undefined,
): void {
  const pending = pendingSessions.get(threadId);
  if (pending) {
    pending.resolve(session);
    pendingSessions.delete(threadId);
  }
}

function waitPendingSession(threadId: string): Promise<ClientSessionState | undefined> {
  let entry = pendingSessions.get(threadId);
  if (!entry) {
    let resolve!: (s: ClientSessionState | undefined) => void;
    entry = { promise: new Promise((r) => (resolve = r)), resolve };
    pendingSessions.set(threadId, entry);
  }
  const fallback = new Promise<undefined>((r) => setTimeout(() => r(undefined), SESSION_WAIT_MS));
  return Promise.race([entry.promise, fallback]);
}

function toMetadata(chat: {
  id: string;
  title: string;
  eve_session: Partial<ClientSessionState>;
  updated_at: string;
}): RemoteThreadMetadata {
  return {
    status: 'regular',
    remoteId: chat.id,
    externalId: chat.eve_session.sessionId,
    title: chat.title || undefined,
    lastMessageAt: new Date(chat.updated_at),
  };
}

const TITLE_MAX = 60;

function firstUserText(messages: readonly ThreadMessage[]): string {
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = m.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ');
    return text.split(FORM_VALUES_MARKER)[0].trim();
  }
  return '';
}

export function createNomitoThreadListAdapter(): RemoteThreadListAdapter {
  return {
    async list(): Promise<RemoteThreadListResponse> {
      const chats = await listChats();
      for (const chat of chats) {
        threadCache.set(chat.id, {
          session: chat.eve_session.sessionId
            ? (chat.eve_session as ClientSessionState)
            : undefined,
          events: chat.events,
        });
      }
      return { threads: chats.map(toMetadata) };
    },

    async initialize(threadId): Promise<RemoteThreadInitializeResponse> {
      // Dedupe: StrictMode double-mounts the thread resource and fires
      // initialize twice for the same thread — both callers must get the
      // same row, not two POSTs.
      let pending = initializing.get(threadId);
      if (!pending) {
        pending = (async () => {
          const session = await waitPendingSession(threadId);
          const chat = await createChat({ eve_session: session ?? {}, events: [] });
          threadCache.set(chat.id, { session, events: [] });
          return { remoteId: chat.id, externalId: session?.sessionId };
        })().finally(() => initializing.delete(threadId));
        initializing.set(threadId, pending);
      }
      return pending;
    },

    async fetch(remoteId): Promise<RemoteThreadMetadata> {
      const chat = await getChat(remoteId);
      threadCache.set(remoteId, {
        session: chat.eve_session.sessionId
          ? (chat.eve_session as ClientSessionState)
          : undefined,
        events: chat.events,
      });
      return toMetadata(chat);
    },

    async rename(remoteId, newTitle) {
      await patchChat(remoteId, { title: newTitle });
    },

    async archive(remoteId) {
      await patchChat(remoteId, { archived_at: new Date().toISOString() });
    },

    async delete(remoteId) {
      await deleteChat(remoteId);
      threadCache.delete(remoteId);
    },

    // Titles derive from the first Traveler message (already the right
    // language); the PATCH must land before the stream completes per the
    // RemoteThreadListAdapter contract.
    async generateTitle(remoteId, messages) {
      const title = firstUserText(messages).slice(0, TITLE_MAX) || 'Nueva conversación';
      return createAssistantStream(async (controller) => {
        await patchChat(remoteId, { title });
        controller.appendText(title);
      });
    },
  };
}
