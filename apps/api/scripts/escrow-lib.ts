// Shared internals for the Escrow vault ops scripts (issue #57):
//
//   escrow-deploy.ts  — deploy contracts/Escrow.sol
//   escrow-admin.ts   — balance / transfer / admin handover on the vault
//   smoke-escrow.ts   — the whole flow on an in-process ganache chain
//
// The contract is compiled IN the script, deterministically: the `solc`
// package is pinned in devDependencies and the settings below are fixed, so
// the same source always yields the same bytecode — nothing to commit, and
// the deployed artifact can never drift from contracts/Escrow.sol.
//
// Network constants come from src/x402.ts's X402 table (the same table the
// API reads) — `sepolia` maps to its `testnet` entry, `mainnet` to `mainnet`.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { verifyTx, withAttribution } from "@celo/attribution-tags";
import { X402 } from "../src/x402.js";

/** The project wallet — the only key allowed to deploy / administrate. */
export const PROJECT_WALLET: Address =
  "0x8BCF810436f39cb386d0137B738a516F44d8731C";

export type ScriptNetwork = "sepolia" | "mainnet";

/** Script-facing name → entry in the API's X402 table. */
const NET_TO_X402 = { sepolia: "testnet", mainnet: "mainnet" } as const;

export const netConfig = (net: ScriptNetwork) => X402[NET_TO_X402[net]];

// ---------------------------------------------------------------------------
// argv — `--network <sepolia|mainnet>` / `-n` / `--net`, or a bare positional.
// Defaults to sepolia: a script that does nothing dangerous should need no
// flag at all.
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): {
  network: ScriptNetwork;
  rest: string[];
} {
  const rest: string[] = [];
  let network: ScriptNetwork = "sepolia";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--network" || a === "--net" || a === "-n") {
      const v = argv[++i];
      if (v !== "sepolia" && v !== "mainnet")
        throw new Error(`--network must be sepolia|mainnet, got "${v ?? ""}"`);
      network = v;
    } else if (a === "sepolia" || a === "mainnet") {
      network = a;
    } else {
      rest.push(a);
    }
  }
  return { network, rest };
}

// ---------------------------------------------------------------------------
// deterministic compile via the pinned `solc` package
// ---------------------------------------------------------------------------

const CONTRACTS_DIR = fileURLToPath(new URL("../contracts", import.meta.url));

export interface CompiledContract {
  abi: Abi;
  bytecode: Hex;
}

interface SolcError {
  severity: string;
  formattedMessage: string;
}

/** Compile every contract in `files` (paths under contracts/). Keyed by name. */
export function compileAll(files: string[]): Record<string, CompiledContract> {
  const sources = Object.fromEntries(
    files.map((f) => [f, { content: readFileSync(`${CONTRACTS_DIR}/${f}`, "utf8") }])
  );
  const out = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources,
        settings: {
          // shanghai: PUSH0-era bytecode — supported on Celo (op-stack) and
          // by the in-process EVMs the smoke verifies on (cancun's MCOPY
          // would be an invalid opcode on ganache).
          evmVersion: "shanghai",
          optimizer: { enabled: true, runs: 200 },
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      })
    )
  ) as { errors?: SolcError[]; contracts?: Record<string, Record<string, { abi: Abi; evm: { bytecode: { object: string } } }>> };
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) {
    throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  }
  const result: Record<string, CompiledContract> = {};
  for (const f of files) {
    for (const [name, c] of Object.entries(out.contracts?.[f] ?? {})) {
      result[name] = { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
    }
  }
  return result;
}

export const compileVault = (): CompiledContract =>
  compileAll(["Escrow.sol"]).EscrowVault;

// ---------------------------------------------------------------------------
// admin key — operator-supplied at invocation ONLY. Never stored in
// apps/api/.env, never printed, never part of an error message.
// ---------------------------------------------------------------------------

export function adminAccount(): PrivateKeyAccount {
  const raw = process.env.ESCROW_ADMIN_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "ESCROW_ADMIN_PRIVATE_KEY is not set — pass the project wallet key at " +
        "invocation (e.g. sourced from apps/agent/.env). It is never stored " +
        "in apps/api/.env."
    );
  }
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("ESCROW_ADMIN_PRIVATE_KEY is not a 32-byte hex key");
  }
  return privateKeyToAccount(key as Hex);
}

/** The key must control the project wallet — checked before any send. */
export function requireProjectWallet(account: PrivateKeyAccount): void {
  if (getAddress(account.address) !== PROJECT_WALLET) {
    throw new Error(
      `the admin key derives to ${account.address}, not the project wallet ` +
        `${PROJECT_WALLET} — aborting rather than operating from the wrong key`
    );
  }
}

// ---------------------------------------------------------------------------
// attribution (ERC-8021) — every tx the scripts send carries the project tag.
// Refuse to send anything untagged; on mainnet this is the hard floor —
// untagged mainnet txs are never credited and cannot be backfilled.
// ---------------------------------------------------------------------------

export function attributionTag(net: ScriptNetwork): string {
  const tag = process.env.CELO_ATTRIBUTION_TAG?.trim();
  if (!tag) {
    throw new Error(
      `CELO_ATTRIBUTION_TAG is not set — refusing to send an untagged ` +
        `${net === "mainnet" ? "mainnet " : ""}transaction`
    );
  }
  if (!tag.startsWith("celo_")) {
    throw new Error("CELO_ATTRIBUTION_TAG must be the celo_… code issued at registration");
  }
  return tag;
}

// ---------------------------------------------------------------------------
// clients
// ---------------------------------------------------------------------------

export const publicClientFor = (net: ScriptNetwork) => {
  const cfg = netConfig(net);
  return createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc) });
};

/**
 * Wallet client for sends. `withAttribution` keeps only sendTransaction /
 * writeContract (+Sync variants) — so writes here go through
 * `sendTransaction` with `encodeFunctionData`: the tag lands as the tail of
 * `data`, which an ERC-20 transfer or a vault call simply ignores.
 */
export function attributedWallet(net: ScriptNetwork, account: PrivateKeyAccount) {
  const cfg = netConfig(net);
  return createWalletClient({
    account,
    chain: cfg.chain,
    transport: http(cfg.rpc),
  }).extend(withAttribution(attributionTag(net)));
}

// ---------------------------------------------------------------------------
// vault + token resolution
// ---------------------------------------------------------------------------

/** The deployed vault address — from .env, checksummed. */
export function escrowAddress(): Address {
  const raw = process.env.ESCROW_ADDRESS?.trim();
  if (!raw || !isAddress(raw)) {
    throw new Error(
      "ESCROW_ADDRESS is not set or invalid — deploy the vault first " +
        "(pnpm escrow:deploy) and put the address in apps/api/.env"
    );
  }
  return getAddress(raw);
}

export interface ResolvedToken {
  /** Symbol when it came from the X402 table, else the raw address. */
  symbol: string;
  address: Address;
  /** Table decimals; undefined for a raw address (read on-chain). */
  decimals?: number;
}

/** A token by symbol from the x402.ts asset table, or a raw 0x address. */
export function resolveToken(net: ScriptNetwork, ref: string): ResolvedToken {
  if (isAddress(ref)) return { symbol: ref, address: getAddress(ref) };
  const def = netConfig(net).tokens[ref.toLowerCase()];
  if (!def) {
    throw new Error(
      `unknown token "${ref}" on ${net} — symbols: ` +
        `${Object.keys(netConfig(net).tokens).join(", ")}, or pass a raw 0x address`
    );
  }
  return { symbol: ref.toLowerCase(), address: def.address, decimals: def.decimals };
}

const ERC20_MIN_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type PublicClient = ReturnType<typeof publicClientFor>;

export async function tokenDecimals(
  client: Pick<PublicClient, "readContract">,
  token: ResolvedToken
): Promise<number> {
  if (token.decimals !== undefined) return token.decimals;
  return Number(
    await client.readContract({
      address: token.address,
      abi: ERC20_MIN_ABI,
      functionName: "decimals",
    })
  );
}

export async function erc20Balance(
  client: Pick<PublicClient, "readContract">,
  token: Address,
  owner: Address
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_MIN_ABI,
    functionName: "balanceOf",
    args: [owner],
  });
}

// ---------------------------------------------------------------------------
// reporting helpers
// ---------------------------------------------------------------------------

export const explorerTx = (net: ScriptNetwork, hash: string) =>
  `${netConfig(net).explorer}/tx/${hash}`;

export const explorerAddress = (net: ScriptNetwork, address: string) =>
  `${netConfig(net).explorer}/address/${address}`;

/** Decode the ERC-8021 suffix off a mined tx; codes found, or null. */
export async function txAttribution(
  client: Pick<PublicClient, "getTransaction">,
  hash: Hex
) {
  return verifyTx({ client, hash });
}
