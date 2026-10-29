// Auth — Bearer-token verification + the shared Supabase admin client.
//
// Callers send the Supabase access token as `Authorization: Bearer`. The
// web server extracts `session.access_token` (@supabase/ssr) and forwards
// it; the chunked SSR cookie is never parsed here. The token is verified by
// passing it through to the Auth server (`auth.getUser`) instead of
// verifying JWKS locally — the passthrough costs one Auth call per request
// but adds no dependency and holds regardless of the project's signing-key
// algorithm. The verified user id IS the traveler id
// (travelers.id = auth.users.id), so no caller-supplied id is ever trusted.
//
// The admin client is a module singleton: one service-role connection per
// process, shared by every router that verifies tokens or does platform
// writes. It bypasses RLS — never ship it to a browser.

import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./supabase.js";
import type { Database } from "./database.types.js";

let admin: SupabaseClient<Database> | null = null;

/** Shared service-role client (see file header); created on first use. */
export function supabaseAdmin(): SupabaseClient<Database> {
  if (!admin) admin = createSupabaseAdmin();
  return admin;
}

/** The raw Bearer token, when the header is well-formed. */
export function bearerToken(c: Context): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "");
  return m ? m[1] : null;
}

/** Verified Traveler id from the request's Bearer token (see file header). */
export async function travelerIdFrom(c: Context): Promise<string | null> {
  const token = bearerToken(c);
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/**
 * Optional-Bearer variant for routes where auth enriches rather than gates
 * (e.g. POST /listings/:slug/book linking the Booking to the caller). No
 * Authorization header → null. Header present → the verified Traveler id, or
 * a 401 Response when the token doesn't verify — the caller returns it as-is:
 *
 *   const who = await optionalTravelerId(c);
 *   if (who !== null && typeof who !== "string") return who;
 *   // who is the verified traveler_id or null
 */
export async function optionalTravelerId(
  c: Context
): Promise<string | Response | null> {
  if (!/^Bearer\s+\S+$/i.test(c.req.header("authorization") ?? "")) return null;
  // A token we cannot verify — bad signature, or no Supabase env on this leg —
  // is a 401, never a silently-ignored one.
  const id = await travelerIdFrom(c).catch(() => null);
  return id ?? c.json({ error: "unauthorized" }, 401);
}
