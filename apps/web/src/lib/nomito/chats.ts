import type { ClientSessionState, MessageStreamEvent } from 'eve/client';

/**
 * Browser client for the Traveler's chat threads. Goes through the
 * same-origin `/api/chats` proxy, which forwards the Supabase session token
 * to apps/api — the service-role secret never reaches the browser.
 *
 * `events` is the cumulative eve stream prefix persisted after each turn:
 * it rehydrates the transcript on resume (`useEveAgentRuntime`'s
 * `initialEvents`) while `eve_session` re-attaches the durable session.
 */
export interface ChatThreadSummary {
  id: string;
  title: string;
  eve_session: Partial<ClientSessionState>;
  events: MessageStreamEvent[];
  created_at: string;
  updated_at: string;
}

export interface ChatThread extends ChatThreadSummary {
  traveler_id: string;
  archived_at: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `chats request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listChats(): Promise<ChatThreadSummary[]> {
  const { chats } = await request<{ chats: ChatThreadSummary[] }>('/api/chats');
  return chats;
}

export async function getChat(id: string): Promise<ChatThread> {
  const { chat } = await request<{ chat: ChatThread }>(`/api/chats/${id}`);
  return chat;
}

export async function createChat(body: {
  title?: string;
  eve_session?: Partial<ClientSessionState>;
  events?: MessageStreamEvent[];
}): Promise<ChatThread> {
  const { chat } = await request<{ chat: ChatThread }>('/api/chats', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return chat;
}

export async function patchChat(
  id: string,
  patch: {
    title?: string;
    eve_session?: Partial<ClientSessionState>;
    events?: MessageStreamEvent[];
    archived_at?: string | null;
  },
): Promise<ChatThread> {
  const { chat } = await request<{ chat: ChatThread }>(`/api/chats/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return chat;
}

/** Soft delete — the row is archived server-side, the transcript survives. */
export async function deleteChat(id: string): Promise<void> {
  await request(`/api/chats/${id}`, { method: 'DELETE' });
}
