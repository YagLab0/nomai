import { ClientError } from 'eve/client';

import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';

/**
 * Shared eve connection helpers for the Nomito chat runtimes
 * (components/app/chat/nomito-runtime.ts).
 *
 * The per-thread `useEveAgentRuntime` (via @assistant-ui/eve) owns session
 * lifecycle and event folding today; what stays here is how we reach the
 * Agent — same-origin `/eve/v1/*` routes mounted by `withEve` — and how the
 * Traveler's Supabase token travels on every request.
 */

// A path-prefix host makes eve's client issue same-origin relative fetches,
// which hit the withEve mount. Override only to point at a remote agent host.
export const EVE_HOST = process.env.NEXT_PUBLIC_EVE_HOST ?? '/';

/**
 * Header carrying the signed-in Traveler's Supabase access token to the Agent,
 * where Traveler-scoped tools (check_wallet, list_bookings) forward it to the
 * API as `Authorization: Bearer`. A dedicated header, not `Authorization`: that
 * one belongs to the Agent's own route auth (vercelOidc). Keep in sync with
 * apps/agent/agent/lib/traveler-auth.ts.
 */
export const TRAVELER_TOKEN_HEADER = 'x-nomai-traveler-token';

/**
 * Resolved before every eve request, so each turn carries the current token
 * (getSession refreshes an expired one). No Supabase env or no session → no
 * header: the chat still works and Traveler-scoped tools answer 401.
 */
export async function travelerHeaders(): Promise<Record<string, string>> {
  if (!hasSupabaseEnv || typeof window === 'undefined') return {};
  try {
    const { data } = await createSupabaseClient().auth.getSession();
    const token = data.session?.access_token;
    return token ? { [TRAVELER_TOKEN_HEADER]: token } : {};
  } catch {
    return {};
  }
}

/** The durable session is gone for good; the next send must recreate it. */
export function isDeadSessionError(err: unknown): boolean {
  return (
    err instanceof ClientError &&
    (err.status === 404 || err.status === 410 || err.code === 'session_stranded')
  );
}
