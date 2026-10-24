// Traveler auth forwarded from the web chat to the Agent's tools.
//
// The web adapter (apps/web/src/lib/nomito/eve-adapter.ts) sends the signed-in
// Traveler's Supabase access token on every eve request in the
// TRAVELER_TOKEN_HEADER header — never in message text or clientContext, so
// the model never sees it. It is a downstream credential for the nomai API,
// NOT agent route auth: the channel's own authenticators still decide who may
// reach /eve/v1 (agent/channels/eve.ts), and withTravelerToken only enriches
// the caller they accepted. eve stamps that caller onto the session as
// ctx.session.auth.current, which is replaced on every inbound turn, so tools
// always read the token that came with the current message.
//
// The token is decoded, not verified: the API verifies it with the Supabase
// Auth server on every Traveler-scoped route (401/403). The decoded `sub` only
// picks which Traveler's resources to ask for — a forged one buys nothing.

import type { AuthFn } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

/** Request header carrying the Traveler's Supabase access token. Keep in sync
 *  with apps/web/src/lib/nomito/eve-adapter.ts. */
export const TRAVELER_TOKEN_HEADER = "x-nomai-traveler-token";

const TOKEN_ATTR = "nomai:traveler_token";

export interface TravelerAuth {
  /** Supabase access token, sent to the API as `Authorization: Bearer`. */
  token: string;
  /** The token's `sub` claim — the Supabase user id, i.e. the traveler id. */
  travelerId: string;
}

/** The `sub` claim of a JWT-shaped string, or null. Payload decode only. */
export function decodeJwtSub(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
    };
    return typeof claims.sub === "string" && claims.sub !== "" ? claims.sub : null;
  } catch {
    return null;
  }
}

function travelerFromToken(token: string | null | undefined): TravelerAuth | null {
  const trimmed = token?.trim();
  if (!trimmed) return null;
  const travelerId = decodeJwtSub(trimmed);
  return travelerId ? { token: trimmed, travelerId } : null;
}

/**
 * Wraps a route authenticator so the caller it accepts also carries the
 * forwarded Traveler token. Never accepts a request on its own: a skip (null)
 * or a throw from the wrapped authenticator passes through untouched. Symbol
 * metadata (e.g. withAuthChallenges' WWW-Authenticate schemes) is copied over
 * so the channel's 401 challenges stay accurate.
 */
export function withTravelerToken(fn: AuthFn<Request>): AuthFn<Request> {
  const wrapped: AuthFn<Request> = async (request) => {
    const caller = await fn(request);
    if (!caller) return caller;
    const { [TOKEN_ATTR]: _stale, ...attributes } = caller.attributes;
    const traveler = travelerFromToken(request.headers.get(TRAVELER_TOKEN_HEADER));
    return {
      ...caller,
      attributes: traveler ? { ...attributes, [TOKEN_ATTR]: traveler.token } : attributes,
    };
  };
  for (const key of Object.getOwnPropertySymbols(fn)) {
    Object.defineProperty(wrapped, key, Object.getOwnPropertyDescriptor(fn, key)!);
  }
  return wrapped;
}

/**
 * The Traveler behind the current turn: NOMAI_TRAVELER_TOKEN when set (the
 * explicit dev override), else the token forwarded with this turn. Null means
 * no signed-in Traveler — Traveler-scoped tools must answer unauthorized.
 */
export function travelerAuth(
  auth: SessionAuthContext | null | undefined,
): TravelerAuth | null {
  const override = travelerFromToken(process.env.NOMAI_TRAVELER_TOKEN);
  if (override) return override;
  const forwarded = auth?.attributes[TOKEN_ATTR];
  return travelerFromToken(typeof forwarded === "string" ? forwarded : null);
}

/** Tool result for a Traveler-scoped call made without a signed-in Traveler. */
export const NO_TRAVELER_SESSION = {
  error: "unauthorized",
  status: 401,
  code: "no_traveler_session",
  hint: "No signed-in Traveler on this chat — ask them to sign in to nomai.",
} as const;
