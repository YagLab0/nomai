// Route auth for /eve/v1 in production.
//
// eve fails closed in production: vercelOidc() accepts only Vercel service
// tokens and localDev() authenticates only local development servers, so
// browser callers need an authenticator of their own. The web chat sends the
// signed-in Traveler's Supabase access token on every request on
// TRAVELER_TOKEN_HEADER (see apps/web/src/lib/nomito/eve-adapter.ts); this
// authenticator verifies it with the Supabase Auth server — the same
// passthrough apps/api/src/auth.ts uses instead of local JWKS verification,
// which holds regardless of the project's signing-key algorithm — and maps the
// verified identity onto a SessionAuthContext.
//
// This is CHANNEL auth ("who may reach the Agent at all"), a boundary above the
// downstream Traveler credential: withTravelerToken (traveler-auth.ts) still
// enriches whichever caller this accepts, and the API re-verifies the same
// token on every Traveler-scoped route. A request without a token — an
// anonymous visitor — is declined (null), so the user gets eve's 401. If the
// app ever wants an anonymous chat, pair it with none() explicitly.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withAuthChallenges, type AuthFn } from "eve/channels/auth";
import type { SessionAuthContext } from "eve/context";

import { TRAVELER_TOKEN_HEADER } from "./traveler-auth";

let verifier: SupabaseClient | null | undefined;

/**
 * Local client for verifying traveler tokens with the Auth server. The
 * publishable key is enough to call auth.getUser with a user's own token and
 * it is not secret (the browser bundle already carries it). Falls back to the
 * NEXT_PUBLIC_ names so the Agent picks up the web app's existing Vercel
 * project env without extra configuration.
 */
function supabaseVerifier(): SupabaseClient | null {
  if (verifier !== undefined) return verifier;
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  verifier =
    url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return verifier;
}

/**
 * Accepts a caller only on a Supabase access token that the Auth server
 * verifies; the verified user id (travelers.id = auth.users.id) becomes the
 * session principal. Falls through (null) on anything else so the next
 * authenticator in the channel's walk gets its turn.
 */
export const supabaseSessionAuth: () => AuthFn<Request> = () =>
  withAuthChallenges(
    async (request) => {
      const client = supabaseVerifier();
      if (!client) return null;
      const token = request.headers.get(TRAVELER_TOKEN_HEADER)?.trim();
      if (!token) return null;
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      const session: SessionAuthContext = {
        authenticator: "supabase",
        issuer: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
        principalId: data.user.id,
        principalType: "user",
        attributes: {},
      };
      return session;
    },
    [{ scheme: "Bearer" }],
  );
