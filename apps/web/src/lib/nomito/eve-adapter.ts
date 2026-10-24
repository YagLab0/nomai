import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';
import { Client, ClientError } from 'eve/client';
import type { ClientSession, MessageResponse } from 'eve/client';

import { creditFailureMessage, spendCredits, type CreditStage } from '@/lib/nomito/credits';
import { MONEDAS_SPENT_KEY } from '@/lib/nomito/tools';

/**
 * ChatModelAdapter backed by the real Nomito agent in apps/agent, reached
 * through the same-origin `/eve/v1/*` routes that `withEve` mounts in Next.
 *
 * One eve session backs the whole chat thread: it is created lazily on the
 * first send and reused afterwards, so the Agent keeps context across Traveler
 * messages. The eve event stream is folded into cumulative assistant-ui
 * content updates. Agent tools stay internal — the narration text and its
 * OpenUI blocks carry the UX — except for the Credits they spend: every turn
 * posts a `conversation` charge up-front, and each completed inventory/pricing
 * tool call posts its stage (issue #17). A 402/429 refusal ends the run with a
 * `credits:*` error the message UI translates.
 */

// A path-prefix host makes eve's client issue same-origin relative fetches,
// which hit the withEve mount. Override only to point at a remote agent host.
const EVE_HOST = process.env.NEXT_PUBLIC_EVE_HOST ?? '/';

const SESSION_RETRY_DELAY_MS = 2_000;

/**
 * Agent tool → the ledger stage its execution spends (ADR-0002 staging).
 * search_listings and quote_booking touch live inventory/pricing;
 * get_listing is a cached-inventory read. book_listing/pay_endpoint move
 * real Booking money, not Credits — unlisted on purpose.
 */
const TOOL_STAGE: Readonly<Record<string, CreditStage>> = {
  search_listings: 'live_query',
  quote_booking: 'live_query',
  get_listing: 'cached_inventory',
};

let client: Client | null = null;
let sessionPromise: Promise<ClientSession> | null = null;

function getClient(): Client {
  client ??= new Client({ host: EVE_HOST });
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
    // Monedas actually charged this run — surfaced as message metadata so the
    // chip/header show the real posted amounts, not a hardcoded price.
    let spent = 0;
    let emittedText = '';
    let emittedSpent = 0;

    const snapshot = (): ChatModelRunResult => ({
      content: [{ type: 'text', text: fullText(steps) }],
      ...(spent > 0 ? { metadata: { custom: { [MONEDAS_SPENT_KEY]: spent } } } : {}),
    });

    /** Yields nothing twice: content replaces, metadata merges — emit on change only. */
    const pendingUpdate = (): ChatModelRunResult | null => {
      const text = fullText(steps);
      if (text === emittedText && spent === emittedSpent) return null;
      emittedText = text;
      emittedSpent = spent;
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
      // The conversation charge is the turn's cover price, paid before the
      // Agent burns any tokens. 402/429 refuse the turn outright; 401 (no
      // session — dev/demo) and an unreachable api degrade to an uncharged
      // turn rather than freezing the chat.
      const cover = await spendCredits('conversation');
      if (cover.ok) {
        spent += cover.amount;
      } else if (cover.code === 'no-credits' || cover.code === 'daily-cap') {
        yield {
          status: {
            type: 'incomplete',
            reason: 'error',
            error: creditFailureMessage(cover.code),
          },
        };
        return;
      }

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
          case 'action.result': {
            const { result, status } = ev.data;
            if (result.kind !== 'tool-result' || status !== 'completed' || result.isError === true) break;
            const stage = TOOL_STAGE[result.toolName];
            if (stage === undefined) break;
            // Tools return {error, …} payloads instead of throwing — a failed
            // lookup is not a spendable query.
            const output = result.output;
            if (output !== null && typeof output === 'object' && 'error' in output) break;

            const charge = await spendCredits(stage, { tool: result.toolName });
            if (charge.ok) {
              spent += charge.amount;
            } else if (charge.code === 'no-credits' || charge.code === 'daily-cap') {
              // The ledger refused the stage — stop the stream rather than
              // hand out results the free-tier ceiling declined to fund.
              // The turn keeps running server-side unless we cancel it.
              failure = creditFailureMessage(charge.code);
              outcome = 'failed';
              void sessionPromise?.then((s) => s.cancel()).catch(() => undefined);
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
            // actions.requested, reasoning.*, step.*, input.*, task.*,
            // agent.started: internal to the agent, nothing to render.
            continue;
        }
        const update = pendingUpdate();
        if (update) yield update;
        if (outcome !== 'open') break;
      }

      const finalMeta =
        spent > 0 ? { metadata: { custom: { [MONEDAS_SPENT_KEY]: spent } } } : {};

      if (abortSignal.aborted || outcome === 'cancelled') {
        yield { status: { type: 'incomplete', reason: 'cancelled' }, ...finalMeta };
      } else if (outcome === 'failed') {
        yield {
          status: {
            type: 'incomplete',
            reason: 'error',
            error: failure ?? 'The agent turn failed.',
          },
          ...finalMeta,
        };
      } else {
        // 'completed' or a quiet stream end (e.g. turn parked on input).
        yield { status: { type: 'complete', reason: 'stop' }, ...finalMeta };
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
