// Network constants and the facilitator client.
//
// The facilitator is the piece that verifies a payment signature and submits the
// settlement transaction. You do not run it — Celo hosts one for each network, and
// the tables below mirror what those instances advertise on `GET /supported`.

// Loaded here, first, because every constant below reads process.env at module
// scope — and both entry points import this file before running their own code.
// Node only reads .env by itself from 20.6 onward, and the workspace supports 18.
import "dotenv/config";

import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Address, Chain } from "viem";
import { celo, celoSepolia } from "viem/chains";

export type X402Network = "testnet" | "mainnet";

export interface TokenDef {
  address: Address;
  /** EIP-712 domain the TOKEN signs with — NOT the symbol (USDT signs as "Tether USD"). */
  domain: { name: string; version: string };
  decimals: number;
  /** eip3009 signs transferWithAuthorization; permit2 needs the facilitator's
   *  sponsored EIP-2612 permit (advertised via the eip2612GasSponsoring extension). */
  transferMethod: "eip3009" | "permit2";
}

interface NetworkConfig {
  facilitator: string;
  caip2: `eip155:${string}`;
  explorer: string;
  /** Celo network slug — written to agent_wallets.network and served by /wallet/*. */
  name: string;
  /** viem chain + public RPC for on-chain reads (e.g. Agent wallet balances). */
  chain: Chain;
  rpc: string;
  tokens: Record<string, TokenDef>;
}

/**
 * Assets the Celo x402 facilitator settles (see GET /supported).
 *
 * Every token here must implement the signed-transfer standard its
 * transferMethod names: eip3009 for the plain `exact` scheme, or an EIP-2612
 * permit into Permit2 for the Ripio wFIAT stablecoins. A token without one of
 * those cannot be settled by this path no matter what you put in `asset`.
 *
 * `domain` lives next to the address rather than beside the price so the two
 * cannot drift apart. Get it wrong and the token rejects the signature at
 * settlement — after the buyer has signed. Both fields were read from the
 * contracts (`name()` / `version()`), not assumed.
 */
export const X402: Record<X402Network, NetworkConfig> = {
  testnet: {
    facilitator: "https://api.x402.sepolia.celo.org",
    caip2: "eip155:11142220",
    explorer: "https://celo-sepolia.blockscout.com",
    name: "celo-sepolia",
    chain: celoSepolia,
    // X402_RPC overrides the read endpoint (private RPC, or a stub in smokes).
    rpc: process.env.X402_RPC ?? "https://forno.celo-sepolia.celo-testnet.org",
    tokens: {
      usdc: {
        address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
        domain: { name: "USDC", version: "2" },
        decimals: 6,
        transferMethod: "eip3009",
      },
    },
  },
  mainnet: {
    facilitator: "https://api.x402.celo.org",
    caip2: "eip155:42220",
    explorer: "https://celoscan.io",
    name: "celo",
    chain: celo,
    rpc: process.env.X402_RPC ?? "https://forno.celo.org",
    tokens: {
      usdc: {
        address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        domain: { name: "USDC", version: "2" },
        decimals: 6,
        transferMethod: "eip3009",
      },
      usdt: {
        address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
        domain: { name: "Tether USD", version: "1" },
        decimals: 6,
        transferMethod: "eip3009",
      },
      usat: {
        address: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
        domain: { name: "Tether America USD", version: "1" },
        decimals: 6,
        transferMethod: "eip3009",
      },
      // Ripio wFIAT — settle through Permit2 with a facilitator-sponsored permit.
      wars: {
        address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
        domain: { name: "Peso Argentino", version: "1" },
        decimals: 18,
        transferMethod: "permit2",
      },
      wbrl: {
        address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0",
        domain: { name: "Real Brasileño", version: "1" },
        decimals: 18,
        transferMethod: "permit2",
      },
      wcop: {
        address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76",
        domain: { name: "Peso Colombiano", version: "1" },
        decimals: 18,
        transferMethod: "permit2",
      },
      wmxn: {
        address: "0x337E7456B420bD3481e7FA61fA9850343d610d34",
        domain: { name: "Peso Mexicano", version: "1" },
        decimals: 18,
        transferMethod: "permit2",
      },
      wpen: {
        address: "0x4F34c8b3b5FB6D98Da888F0feA543d4d9C9F2eBE",
        domain: { name: "Sol Peruano", version: "1" },
        decimals: 18,
        transferMethod: "permit2",
      },
      wclp: {
        address: "0x61D450a098b6a7f69fC4b98CE68198fe59768651",
        domain: { name: "Peso Chileno", version: "1" },
        decimals: 18,
        transferMethod: "permit2",
      },
    },
  },
};

/**
 * Traveler country → (wFIAT token symbol, fiat currency). One wFIAT per
 * country — the token symbol keys into the active network's `tokens` table,
 * so a network that doesn't configure it (testnet has none) simply has no
 * balance to read there. Uruguay is served by the wFIAT rail without a token
 * of its own.
 */
export const COUNTRY_WFIAT: Record<string, { token: string; fiat: string }> = {
  AR: { token: "wars", fiat: "ARS" },
  BR: { token: "wbrl", fiat: "BRL" },
  CL: { token: "wclp", fiat: "CLP" },
  CO: { token: "wcop", fiat: "COP" },
  MX: { token: "wmxn", fiat: "MXN" },
  PE: { token: "wpen", fiat: "PEN" },
};

/**
 * Lodging fiat currency → the wFIAT symbol a Booking charges in (issue #58):
 * an ARS-priced Lodging settles in wARS. Derived from COUNTRY_WFIAT so the
 * two never drift; only USD falls outside it, settling in USDC. A fiat
 * with no wFIAT of its own (UYU) has no settlement asset at all — the
 * Booking fails explicitly rather than charge a wrong amount in another
 * token. Cross-wFIAT stays a documented gap: a Traveler holding wARS who
 * books a BRL Lodging must Fund wBRL through the ramp — the Booking does
 * no FX conversion (ADR-0001 is future work).
 */
export const FIAT_WFIAT: Record<string, string> = Object.fromEntries(
  Object.values(COUNTRY_WFIAT).map((w) => [w.fiat, w.token])
);

/** Testnet by default, so running this scaffold costs nothing. */
export const NETWORK: X402Network =
  process.env.X402_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const CONFIG = X402[NETWORK];

/** wFIAT readable on the active network: every country token it configures. */
export const WFIAT = Object.entries(COUNTRY_WFIAT)
  .map(([country, { token, fiat }]) => ({
    country,
    token,
    fiat,
    def: CONFIG.tokens[token],
  }))
  .filter(
    (t): t is { country: string; token: string; fiat: string; def: TokenDef } =>
      Boolean(t.def)
  );

/** CAIP-2 chain id, e.g. `eip155:11142220`. The `@x402` packages key schemes by this. */
export const CAIP2 = CONFIG.caip2;

/**
 * The platform wallet — the Service-fee destination for when the Escrow
 * vault releases (ADR-0005/0006). It is NOT the Booking payTo: since #61
 * every Booking settles into the shared vault (ESCROW_ADDRESS) and paying
 * the Owner or the platform at settle time is exactly what the vault
 * prevents. Reserved for the release tooling — nothing reads it yet.
 */
export const PAY_TO = process.env.X402_PAY_TO;

/**
 * Assets this seller accepts, e.g. X402_ASSETS="usdc,wars" lets the buyer pay in
 * whichever it holds. Only assets the facilitator supports on this network are
 * valid — wFIAT exists on mainnet only.
 */
export const ACCEPTED_TOKENS = (process.env.X402_ASSETS ?? "usdc")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
  .map((symbol) => {
    const token = CONFIG.tokens[symbol];
    if (!token) {
      throw new Error(
        `X402_ASSETS: "${symbol}" is not supported on ${NETWORK} — options: ${Object.keys(CONFIG.tokens).join(", ")}`
      );
    }
    return { symbol, ...token };
  });

/** True when any accepted asset needs the sponsored EIP-2612 permit extension. */
export const NEEDS_PERMIT2_SPONSORING = ACCEPTED_TOKENS.some(
  (t) => t.transferMethod === "permit2"
);

/**
 * The facilitator client. The API key is attached to every facilitator call and
 * never reaches the buyer — it identifies YOU to the facilitator, it is not part
 * of the payment.
 *
 * The key is REQUIRED, on testnet as well. Get one at https://x402.celo.org —
 * connect a wallet, click "Create API key", sign a message. No gas, and new
 * accounts start with free credits on both networks.
 *
 * `/supported` and `/verify` both answer without a key, so everything looks
 * healthy right up to `/settle`, which returns 401 after the buyer has already
 * signed. Do not read a working 402 as proof that the key is unnecessary.
 */
export const facilitator = new HTTPFacilitatorClient({
  url: CONFIG.facilitator,
  createAuthHeaders: async () => {
    const headers = { "X-API-Key": process.env.X402_API_KEY ?? "" };
    return { verify: headers, settle: headers, supported: headers };
  },
});
