// Chat threads — the Traveler's saved Nomito conversations.
//
// Bearer-scoped like /usage: the verified token's user id IS the Traveler,
// and every query also runs on the JWT-scoped client so RLS (auth.uid() =
// traveler_id) enforces per-user isolation in Postgres itself — a foreign
// id is simply invisible, which is why reads answer 404, never 403.
//
//   GET    /chats      → { chats }  live threads, most recently active first
//   POST   /chats      → 201 { chat }
//   GET    /chats/:id  → { chat }   full row (eve_session + events)
//   PATCH  /chats/:id  → { chat }   whitelist: title / eve_session / events / archived_at
//   DELETE /chats/:id  → archive (soft delete — the transcript survives)

import { Hono, type Context } from "hono";
import { bearerToken, travelerIdFrom } from "./auth.js";
import { createSupabaseUser } from "./supabase.js";
import type { Database, Json } from "./database.types.js";

type ChatThreadUpdate = Database["public"]["Tables"]["chat_threads"]["Update"];

/** A verified Traveler's JWT-scoped client, or the 401 Response to return
 * (same shape as owners.ts ownerClient). */
async function travelerClient(c: Context) {
  const token = bearerToken(c);
  const userId = token ? await travelerIdFrom(c) : null;
  if (!token || !userId)
    return { response: c.json({ error: "unauthorized" }, 401) } as const;
  return { userId, supabase: createSupabaseUser(token) } as const;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND = { error: "chat not found", code: "not_found" } as const;

// Transcript cap: `events` is rewritten whole per PATCH; ~1 MB is several
// hundred turns' worth and keeps row churn + PostgREST payloads bounded.
const MAX_EVENTS_BYTES = 1_000_000;
const eventsField = (value: unknown): { events?: Json[]; error?: string } => {
  if (!Array.isArray(value)) return { error: "events must be an array" };
  if (JSON.stringify(value).length > MAX_EVENTS_BYTES)
    return { error: "events too large" };
  return { events: value as Json[] };
};

const chats = new Hono();

// GET /chats — the caller's live threads, most recently active first. The
// list carries eve_session + events too: the web adapter primes its
// per-thread resume state from this single round-trip.
chats.get("/", async (c) => {
  const who = await travelerClient(c);
  if ("response" in who) return who.response;
  const { userId, supabase } = who;

  let q = supabase
    .from("chat_threads")
    .select("id, title, eve_session, events, created_at, updated_at")
    .eq("traveler_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  const limit = Number(c.req.query("limit"));
  if (Number.isInteger(limit) && limit > 0) q = q.limit(Math.min(limit, 100));

  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ chats: data ?? [] });
});

// POST /chats — create a thread (optionally with its eve session state).
chats.post("/", async (c) => {
  const who = await travelerClient(c);
  if ("response" in who) return who.response;
  const { userId, supabase } = who;

  const body = (await c.req.json().catch(() => ({}))) as {
    title?: unknown;
    eve_session?: unknown;
    events?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.slice(0, 200) : "";
  const eveSession =
    body?.eve_session != null &&
    typeof body.eve_session === "object" &&
    !Array.isArray(body.eve_session)
      ? (body.eve_session as NonNullable<Json>)
      : {};
  const ev = eventsField(body?.events ?? []);
  if (ev.error) return c.json({ error: ev.error }, 400);

  const { data: row, error } = await supabase
    .from("chat_threads")
    .insert({
      traveler_id: userId,
      title,
      eve_session: eveSession,
      events: ev.events ?? [],
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ chat: row }, 201);
});

// GET /chats/:id — full row including eve_session + events.
chats.get("/:id", async (c) => {
  const who = await travelerClient(c);
  if ("response" in who) return who.response;
  const { userId, supabase } = who;

  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json(NOT_FOUND, 404); // 22P02 guard

  const { data: row, error } = await supabase
    .from("chat_threads")
    .select()
    .eq("id", id)
    .eq("traveler_id", userId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!row) return c.json(NOT_FOUND, 404);
  return c.json({ chat: row });
});

// PATCH /chats/:id — whitelist: title / eve_session / events / archived_at.
// archived_at accepts an ISO string (archive) or null (restore).
chats.patch("/:id", async (c) => {
  const who = await travelerClient(c);
  if ("response" in who) return who.response;
  const { userId, supabase } = who;

  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json(NOT_FOUND, 404);

  const body = (await c.req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return c.json({ error: "invalid body" }, 400);

  const patch: ChatThreadUpdate = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string")
      return c.json({ error: "title must be a string" }, 400);
    patch.title = body.title.slice(0, 200);
  }
  if (body.eve_session !== undefined) {
    if (
      typeof body.eve_session !== "object" ||
      body.eve_session === null ||
      Array.isArray(body.eve_session)
    )
      return c.json({ error: "eve_session must be an object" }, 400);
    patch.eve_session = body.eve_session as NonNullable<Json>;
  }
  if (body.events !== undefined) {
    const ev = eventsField(body.events);
    if (ev.error) return c.json({ error: ev.error }, 400);
    patch.events = ev.events;
  }
  if (body.archived_at !== undefined) {
    if (body.archived_at !== null && typeof body.archived_at !== "string")
      return c.json({ error: "archived_at must be a timestamp or null" }, 400);
    patch.archived_at = body.archived_at;
  }
  if (Object.keys(patch).length === 0)
    return c.json({ error: "nothing to update" }, 400);

  const { data: row, error } = await supabase
    .from("chat_threads")
    .update(patch)
    .eq("id", id)
    .eq("traveler_id", userId)
    .select()
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!row) return c.json(NOT_FOUND, 404);
  return c.json({ chat: row });
});

// DELETE /chats/:id — archive semantics like DELETE /owners/lodgings/:id:
// sets archived_at rather than deleting the row (the transcript survives).
chats.delete("/:id", async (c) => {
  const who = await travelerClient(c);
  if ("response" in who) return who.response;
  const { userId, supabase } = who;

  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json(NOT_FOUND, 404);

  const { data: row, error } = await supabase
    .from("chat_threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("traveler_id", userId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!row) return c.json(NOT_FOUND, 404);
  return c.json({ success: true, chat_id: row.id });
});

export default chats;
