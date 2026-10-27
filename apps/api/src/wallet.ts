import { Hono, type Context } from "hono";
import {
  keccak256,
  stringToHex,
  createPublicClient,
  http,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSupabaseAdmin } from "./supabase.js";
import { travelerIdFrom } from "./credits.js";
import { CONFIG } from "./x402.js";

const router = new Hono();

export const publicClient = createPublicClient({
  chain: CONFIG.chain,
  transport: http(CONFIG.rpc),
});

/**
 * Deterministically derives a Celo/EVM address for a Traveler's agent wallet
 * from the platform master secret and the traveler's UUID.
 *
 * Testnet custody (ADR-0003):
 * - Key material is NEVER stored in the database.
 * - The DB stores only address, network, and traveler_id in public.agent_wallets.
 * - The keyRef conceptual identifier documents the derivation path.
 */
export function deriveAgentWallet(travelerId: string): { address: Address; keyRef: string } {
  const masterSecret = process.env.AGENT_WALLET_MASTER_SECRET;
  if (!masterSecret) {
    throw new Error("AGENT_WALLET_MASTER_SECRET is not set");
  }
  const seed = `${masterSecret}:${travelerId}`;
  const privateKey = keccak256(stringToHex(seed));
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    keyRef: `env:AGENT_WALLET_MASTER_SECRET#${travelerId}`,
  };
}

/**
 * Provisions an agent_wallet row for a traveler if one does not already exist.
 * Idempotent (unique constraint on traveler_id).
 */
export async function provisionAgentWallet(travelerId: string) {
  try {
    const supabase = createSupabaseAdmin();

    // Check if wallet already exists
    const { data: existing, error: fetchError } = await supabase
      .from("agent_wallets")
      .select("id, traveler_id, address, network, created_at")
      .eq("traveler_id", travelerId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to query agent_wallets: ${fetchError.message}`);
    }

    if (existing) {
      return existing;
    }

    const { address } = deriveAgentWallet(travelerId);

    const { data: inserted, error: insertError } = await supabase
      .from("agent_wallets")
      .insert({
        traveler_id: travelerId,
        address,
        network: CONFIG.name,
      })
      .select("id, traveler_id, address, network, created_at")
      .single();

    if (insertError) {
      // In case of concurrent race condition, check again
      if (insertError.code === "23505") {
        const { data: raceExisting } = await supabase
          .from("agent_wallets")
          .select("id, traveler_id, address, network, created_at")
          .eq("traveler_id", travelerId)
          .single();
        if (raceExisting) return raceExisting;
      }
      throw new Error(`Failed to insert agent_wallet: ${insertError.message}`);
    }

    return inserted;
  } catch (err) {
    // Every creation failure lands in the server log with traveler_id and
    // cause — never key material, which derivation keeps out of errors.
    const cause = err instanceof Error ? err.message : String(err);
    console.error(
      `agent wallet creation failed for traveler ${travelerId}: ${cause}`
    );
    throw err;
  }
}

// Auth (same contract as /credits/*): `Authorization: Bearer <Supabase access
// token>`, verified through the Auth server. No/invalid token → 401; a valid
// token for a different Traveler than the requested traveler_id → 403.
async function authorize(c: Context, travelerId: string) {
  const callerId = await travelerIdFrom(c);
  if (!callerId) return c.json({ error: "unauthorized" }, 401);
  if (callerId !== travelerId) return c.json({ error: "forbidden" }, 403);
  return null;
}

// POST /wallet/provision - body: { traveler_id: string }
router.post("/provision", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { traveler_id?: string };
  const travelerId = body.traveler_id;
  if (!travelerId || typeof travelerId !== "string") {
    return c.json({ error: "traveler_id is required" }, 400);
  }
  const denied = await authorize(c, travelerId);
  if (denied) return denied;

  try {
    const wallet = await provisionAgentWallet(travelerId);
    return c.json({ ok: true, wallet });
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }
});

// GET /wallet/:traveler_id - returns address & on-chain balance
router.get("/:traveler_id", async (c) => {
  const travelerId = c.req.param("traveler_id");
  const denied = await authorize(c, travelerId);
  if (denied) return denied;
  try {
    const wallet = await provisionAgentWallet(travelerId);
    let balanceCelo: string;
    try {
      const wei = await publicClient.getBalance({ address: wallet.address as Address });
      balanceCelo = formatEther(wei);
    } catch {
      // An unreachable RPC must never read as an empty wallet.
      return c.json(
        {
          error: "rpc_unreachable",
          address: wallet.address,
          network: wallet.network,
        },
        502
      );
    }

    return c.json({
      ok: true,
      address: wallet.address,
      network: wallet.network,
      balance: balanceCelo,
    });
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }
});

export default router;
