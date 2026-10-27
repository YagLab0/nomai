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
    rpc: "https://forno.celo-sepolia.celo-testnet.org",
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
    rpc: "https://forno.celo.org",
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
    },
  },
};

/** Testnet by default, so running this scaffold costs nothing. */
export const NETWORK: X402Network =
  process.env.X402_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const CONFIG = X402[NETWORK];

/** CAIP-2 chain id, e.g. `eip155:11142220`. The `@x402` packages key schemes by this. */
export const CAIP2 = CONFIG.caip2;

/**
 * Fallback payTo for the Booking endpoint (book-payment.ts) — used only
 * when a listing has no business.payout_address of its own. There is no
 * generic paid route anymore (D4), so no X402_PRICE.
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
