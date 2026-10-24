// Escrow keeper trigger — POST /internal/keeper (ADR-0006).
//
// Ops-only: meant for a cron job (or a manual curl) to run on a schedule.
// Each call runs process_escrow_releases() once, which is what advances the
// Escrow lifecycle — escrow_status funded → partially_released (50% at the
// Cancellation deadline) → released (the rest 24 h after check-in, no open
// Claim) — and the Booking status confirmed → in_progress (check-in day) →
// completed (final release). Nothing else calls it; without this trigger
// funds never leave the Escrow. The RPC is idempotent per Booking (release
// timestamps guard each stage), so overlapping or repeated runs are safe.
//
// Auth: `Authorization: Bearer <KEEPER_SECRET>`. KEEPER_SECRET unset → every
// call is 401 (the endpoint is off, never open). Success → 200 with the RPC's
// { ok, released: [booking ids] }; RPC failure → 502.

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { processEscrowReleases } from "./data/supabase.js";

const keeper = new Hono();

function authorized(header: string | undefined): boolean {
  const secret = process.env.KEEPER_SECRET;
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!secret || !m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

keeper.post("/keeper", async (c) => {
  if (!authorized(c.req.header("authorization")))
    return c.json({ error: "unauthorized" }, 401);
  try {
    return c.json(await processEscrowReleases());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("keeper: process_escrow_releases failed", err);
    return c.json({ ok: false, error: message }, 502);
  }
});

export default keeper;
