import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';
import { Client, ClientError } from 'eve/client';
import type { ClientSession, MessageResponse } from 'eve/client';

import { TOOL_STATUS_KEY, toolLabel } from '@/lib/nomito/tool-status';
import type { ToolStatusEntry } from '@/lib/nomito/tool-status';
import { stepSummary, summarizeReasoning, TRACE_KEY } from '@/lib/nomito/trace';
import type { NomitoTraceEntry } from '@/lib/nomito/trace';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';

/**
 * ChatModelAdapter backed by the real Nomito agent in apps/agent, reached
 * through the same-origin `/eve/v1/*` routes that `withEve` mounts in Next.
 *
 * One eve session backs the whole chat thread: it is created lazily on the
 * first send and reused afterwards, so the Agent keeps context across Traveler
 * messages. The eve event stream is folded into cumulative assistant-ui
 * content updates. Agent tools stay internal — the narration text and its
 * OpenUI blocks carry the UX; tool calls only surface as localized chips
 * (metadata.custom, see tool-status.ts), and the model's step/reasoning
 * events fold into a thinking trace (see trace.ts) alongside them.
 * Credits (monedas) were retired by ADR-0005: chat turns are free and never
 * meter or refuse on the ledger.
 */

// A path-prefix host makes eve's client issue same-origin relative fetches,
// which hit the withEve mount. Override only to point at a remote agent host.
const EVE_HOST = process.env.NEXT_PUBLIC_EVE_HOST ?? '/';

const SESSION_RETRY_DELAY_MS = 2_000;

let client: Client | null = null;
let sessionPromise: Promise<ClientSession> | null = null;

/**
 * Header carrying the signed-in Traveler's Supabase access token to the Agent,
 * where Traveler-scoped tools (check_wallet, list_bookings) forward it to the
 * API as `Authorization: Bearer`. A dedicated header, not `Authorization`: that
 * one belongs to the Agent's own route auth (vercelOidc). Keep in sync with
 * apps/agent/agent/lib/traveler-auth.ts.
 */
const TRAVELER_TOKEN_HEADER = 'x-nomai-traveler-token';

/**
 * Resolved before every eve request, so each turn carries the current token
 * (getSession refreshes an expired one). No Supabase env or no session → no
 * header: the chat still works and Traveler-scoped tools answer 401.
 */
async function travelerHeaders(): Promise<Record<string, string>> {
  if (!hasSupabaseEnv || typeof window === 'undefined') return {};
  try {
    const { data } = await createSupabaseClient().auth.getSession();
    const token = data.session?.access_token;
    return token ? { [TRAVELER_TOKEN_HEADER]: token } : {};
  } catch {
    return {};
  }
}

function getClient(): Client {
  // redirect: 'error' keeps the credential header from following a redirect.
  client ??= new Client({ host: EVE_HOST, headers: travelerHeaders, redirect: 'error' });
  return client;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The session is gone for good; the next send must recreate it. */
function isDeadSessionError(err: unknown): boolean {
  return (
    err instanceof ClientError &&
    (err.status === 404 || err.status === 410 || err.code === 'session_stranded')
  );
}

/**
 * Transient failure worth one retry. `session.send` already retries
 * `session_not_ready` (409) internally for ~20s; this covers session creation
 * and the cases where the internal budget runs out.
 */
function isRetryableError(err: unknown): boolean {
  if (err instanceof ClientError) {
    return (
      err.status === 409 || err.status === 425 || err.status === 429 || err.status >= 500
    );
  }
  // fetch() surfaces network failures as TypeError in the browser.
  return err instanceof TypeError;
}

async function createSession(): Promise<ClientSession> {
  try {
    const { session } = await getClient().sessions.create();
    return session;
  } catch (err) {
    if (!isRetryableError(err)) throw err;
    await sleep(SESSION_RETRY_DELAY_MS);
    const { session } = await getClient().sessions.create();
    return session;
  }
}

function getSession(): Promise<ClientSession> {
  sessionPromise ??= createSession().catch((err: unknown) => {
    sessionPromise = null; // never cache a rejected session
    throw err;
  });
  return sessionPromise;
}

/** Drops the cached session so the next message starts a fresh conversation. */
export function resetEveSession(): void {
  const pending = sessionPromise;
  sessionPromise = null;
  // Terminally retire the old session server-side, best-effort.
  void pending
    ?.then((session) => session.reset({ reason: 'new-chat' }))
    .catch(() => undefined);
}

async function sendUserMessage(
  text: string,
  abortSignal: AbortSignal,
): Promise<MessageResponse> {
  let session = await getSession();
  try {
    return await session.send(text, { signal: abortSignal });
  } catch (err) {
    if (isDeadSessionError(err)) {
      // Recreate once on a fresh session, then give up to the caller.
      sessionPromise = null;
      session = await getSession();
      return await session.send(text, { signal: abortSignal });
    }
    if (isRetryableError(err) && !abortSignal.aborted) {
      await sleep(SESSION_RETRY_DELAY_MS);
      return await session.send(text, { signal: abortSignal });
    }
    throw err;
  }
}

/**
 * One step's text as a list of blocks. A turn emits several assistant
 * messages (narration before a tool call, then the final answer): each
 * `message.completed` closes one block with the authoritative text for that
 * message, replacing whatever its deltas accumulated.
 */
type StepBuffer = { blocks: string[]; open: boolean };

function stepBuffer(steps: Map<number, StepBuffer>, stepIndex: number): StepBuffer {
  let buf = steps.get(stepIndex);
  if (buf === undefined) {
    buf = { blocks: [], open: false };
    steps.set(stepIndex, buf);
  }
  return buf;
}

function appendDelta(steps: Map<number, StepBuffer>, stepIndex: number, delta: string): void {
  const buf = stepBuffer(steps, stepIndex);
  if (!buf.open) {
    buf.blocks.push('');
    buf.open = true;
  }
  buf.blocks[buf.blocks.length - 1] += delta;
}

function completeMessage(steps: Map<number, StepBuffer>, stepIndex: number, message: string): void {
  const buf = stepBuffer(steps, stepIndex);
  if (buf.open) {
    buf.blocks[buf.blocks.length - 1] = message;
    buf.open = false;
  } else {
    // A second finished message within the same step: keep both.
    buf.blocks.push(message);
  }
}

function fullText(steps: Map<number, StepBuffer>): string {
  return [...steps.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, buf]) => buf.blocks)
    .filter((block) => block.length > 0)
    .join('\n\n');
}

function lastUserText(messages: Parameters<ChatModelAdapter['run']>[0]['messages']): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    return m.content.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
  }
  return '';
}

export const eveAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const steps = new Map<number, StepBuffer>();
    // Insertion-ordered by callId: one entry per action the model invoked.
    const tools = new Map<string, ToolStatusEntry>();
    // The thinking trace: one entry per model step, plus one per reasoning
    // block (mutated in place while its deltas stream). Both maps key on
    // stepIndex; `stepLabels` accumulates the Spanish tool labels that
    // refine a step's provisional summary.
    const trace: NomitoTraceEntry[] = [];
    const stepTrace = new Map<number, NomitoTraceEntry>();
    const stepLabels = new Map<number, string[]>();
    const openReasoning = new Map<number, { entry: NomitoTraceEntry; buf: string }>();
    let emittedKey = '';

    const snapshot = (): ChatModelRunResult => ({
      content: [{ type: 'text', text: fullText(steps) }],
      metadata: {
        // Fresh arrays per update: entries mutate in place, so the stored
        // reference must change for selectors to re-read them.
        custom: { [TOOL_STATUS_KEY]: [...tools.values()], [TRACE_KEY]: [...trace] },
      },
    });

    /** Yields nothing twice: content replaces — emit on change only. */
    const pendingUpdate = (): ChatModelRunResult | null => {
      const key = JSON.stringify([fullText(steps), [...tools.values()], trace]);
      if (key === emittedKey) return null;
      emittedKey = key;
      return snapshot();
    };

    // The send() signal already closes our stream read on abort; this asks
    // eve to stop the running turn server-side too (fire-and-forget — it
    // must never delay or break the abort path). Registered before the send
    // so an abort mid-POST still reaches the session once it exists.
    const onAbort = () =>
      void sessionPromise
        ?.then((session) => session.cancel())
        .catch(() => undefined);
    abortSignal.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await sendUserMessage(lastUserText(messages), abortSignal);

      let outcome: 'open' | 'completed' | 'cancelled' | 'failed' = 'open';
      let failure: string | undefined;

      for await (const ev of response) {
        if (abortSignal.aborted) {
          outcome = 'cancelled';
          break;
        }
        switch (ev.type) {
          case 'message.appended':
            appendDelta(steps, ev.data.stepIndex, ev.data.messageDelta);
            break;
          case 'message.completed':
            completeMessage(steps, ev.data.stepIndex, ev.data.message);
            break;
          case 'step.started': {
            if (!stepTrace.has(ev.data.stepIndex)) {
              const entry: NomitoTraceEntry = {
                kind: 'step',
                label: stepSummary(ev.data.stepIndex),
                done: false,
              };
              trace.push(entry);
              stepTrace.set(ev.data.stepIndex, entry);
            }
            break;
          }
          case 'reasoning.appended': {
            let block = openReasoning.get(ev.data.stepIndex);
            if (!block) {
              block = { entry: { kind: 'reasoning', label: '', done: false }, buf: '' };
              openReasoning.set(ev.data.stepIndex, block);
              trace.push(block.entry);
            }
            block.buf += ev.data.reasoningDelta;
            block.entry.label = summarizeReasoning(block.buf);
            break;
          }
          case 'reasoning.completed': {
            const block = openReasoning.get(ev.data.stepIndex);
            const label = summarizeReasoning(ev.data.reasoning);
            if (block) {
              block.entry.label = label;
              block.entry.done = true;
              openReasoning.delete(ev.data.stepIndex);
            } else if (label) {
              trace.push({ kind: 'reasoning', label, done: true });
            }
            break;
          }
          case 'actions.requested': {
            const labels = stepLabels.get(ev.data.stepIndex) ?? [];
            for (const action of ev.data.actions) {
              if (action.kind === 'load-skill' || tools.has(action.callId)) continue;
              const name = 'toolName' in action ? action.toolName : action.name;
              const label = toolLabel(name);
              tools.set(action.callId, { callId: action.callId, name, label, done: false });
              if (!labels.includes(label)) labels.push(label);
            }
            // The tools a step calls are its best Traveler-facing summary.
            if (labels.length > 0) {
              stepLabels.set(ev.data.stepIndex, labels);
              const stepEntry = stepTrace.get(ev.data.stepIndex);
              if (stepEntry) {
                stepEntry.label =
                  labels.slice(0, 2).join(' · ') +
                  (labels.length > 2 ? ` y ${labels.length - 2} más` : '');
              }
            }
            break;
          }
          case 'action.result': {
            const entry = tools.get(ev.data.result.callId);
            if (entry) tools.set(entry.callId, { ...entry, done: true });
            break;
          }
          case 'step.completed':
          case 'step.failed': {
            const stepEntry = stepTrace.get(ev.data.stepIndex);
            if (stepEntry) stepEntry.done = true;
            const pending = openReasoning.get(ev.data.stepIndex);
            if (pending) {
              pending.entry.done = true;
              openReasoning.delete(ev.data.stepIndex);
            }
            break;
          }
          case 'turn.failed':
          case 'session.failed':
            outcome = 'failed';
            failure = `${ev.data.code}: ${ev.data.message}`;
            break;
          case 'turn.cancelled':
            outcome = 'cancelled';
            break;
          case 'turn.completed':
          case 'session.waiting':
          case 'session.completed':
            outcome = 'completed';
            break;
          default:
            // input.*, task.*, action.partial, agent.started, result.*:
            // internal to the agent, nothing to render.
            continue;
        }
        const update = pendingUpdate();
        if (update) yield update;
        if (outcome !== 'open') break;
      }

      if (abortSignal.aborted || outcome === 'cancelled') {
        yield { status: { type: 'incomplete', reason: 'cancelled' } };
      } else if (outcome === 'failed') {
        yield {
          status: {
            type: 'incomplete',
            reason: 'error',
            error: failure ?? 'The agent turn failed.',
          },
        };
      } else {
        // 'completed' or a quiet stream end (e.g. turn parked on input).
        yield { status: { type: 'complete', reason: 'stop' } };
      }
    } catch (err) {
      if (isDeadSessionError(err)) sessionPromise = null;
      if (abortSignal.aborted) {
        yield { status: { type: 'incomplete', reason: 'cancelled' } };
        return;
      }
      console.error('[eve-adapter] run failed:', err);
      yield {
        status: {
          type: 'incomplete',
          reason: 'error',
          error: err instanceof Error ? err.message : String(err),
        },
      };
    } finally {
      abortSignal.removeEventListener('abort', onAbort);
    }
  },
};
