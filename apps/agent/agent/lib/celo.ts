import { toDataSuffix } from "@celo/attribution-tags";
import { getAddress, createPublicClient, createWalletClient, http, type Hex } from "viem";
import { celo, celoSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Celo chain config for the agent's wallet + x402 payments.
// Sepolia is the dev network (USDC only); mainnet adds the Ripio wFIAT tokens.

export type NetworkName = "sepolia" | "mainnet";

export function networkName(): NetworkName {
  return process.env.X402_NETWORK === "mainnet" ? "mainnet" : "sepolia";
}

export const CHAIN = { sepolia: celoSepolia, mainnet: celo } as const;
export const NETWORK_CAIP2 = {
  sepolia: "eip155:11142220",
  mainnet: "eip155:42220",
} as const;

export const RPC_URL = {
  sepolia: "https://forno.celo-sepolia.celo-testnet.org",
  mainnet: "https://forno.celo.org",
} as const;

export const FACILITATOR_URL = {
  sepolia: "https://api.x402.sepolia.celo.org",
  mainnet: "https://api.x402.celo.org",
} as const;

export interface TokenDef {
  address: `0x${string}`;
  /** EIP-712 domain name — NOT the symbol (USDT signs as "Tether USD"). */
  eip712Name: string;
  eip712Version: string;
  decimals: number;
  transferMethod: "eip3009" | "permit2";
}

// Assets the Celo x402 facilitator settles (see GET /supported).
export const TOKENS: Record<NetworkName, Record<string, TokenDef>> = {
  sepolia: {
    usdc: {
      address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
      eip712Name: "USDC",
      eip712Version: "2",
      decimals: 6,
      transferMethod: "eip3009",
    },
  },
  mainnet: {
    usdc: {
      address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      eip712Name: "USDC",
      eip712Version: "2",
      decimals: 6,
      transferMethod: "eip3009",
    },
    usdt: {
      address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      eip712Name: "Tether USD",
      eip712Version: "1",
      decimals: 6,
      transferMethod: "eip3009",
    },
    usat: {
      address: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
      eip712Name: "Tether America USD",
      eip712Version: "1",
      decimals: 6,
      transferMethod: "eip3009",
    },
    // Ripio wFIAT — enabled on the facilitator today:
    wars: {
      address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
      eip712Name: "Peso Argentino",
      eip712Version: "1",
      decimals: 18,
      transferMethod: "permit2",
    },
    wbrl: {
      address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0",
      eip712Name: "Real Brasileño",
      eip712Version: "1",
      decimals: 18,
      transferMethod: "permit2",
    },
    wcop: {
      address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76",
      eip712Name: "Peso Colombiano",
      eip712Version: "1",
      decimals: 18,
      transferMethod: "permit2",
    },
  },
};

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No readable .env — rely on the environment.
}

export function agentAccount() {
  const key = process.env.CELO_PRIVATE_KEY;
  if (!key) {
    throw new Error("CELO_PRIVATE_KEY is not set (the agent wallet).");
  }
  return privateKeyToAccount(key as Hex);
}

/** Address that receives x402 payments. Defaults to the agent wallet. */
export function payeeAddress(): `0x${string}` {
  const explicit = process.env.PAYEE_ADDRESS;
  if (explicit) return getAddress(explicit);
  return agentAccount().address;
}

export function publicClient(name: NetworkName = networkName()) {
  return createPublicClient({ chain: CHAIN[name], transport: http(RPC_URL[name]) });
}

/**
 * Wallet client for txs the agent sends itself (ERC-8004 register, transfers).
 * The hackathon attribution tag goes in `dataSuffix` on every tx — it cannot be
 * backfilled, so it is wired here once for all sends.
 * Set CELO_ATTRIBUTION_TAG to the `celo_…` tag issued at registration.
 */
export function walletClient(name: NetworkName = networkName()) {
  const tag = process.env.CELO_ATTRIBUTION_TAG;
  return createWalletClient({
    account: agentAccount(),
    chain: CHAIN[name],
    transport: http(RPC_URL[name]),
    dataSuffix: tag ? toDataSuffix(tag) : undefined,
  });
}
