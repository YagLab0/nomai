import { verifyTx } from "@celo/attribution-tags";
import { getAddress, parseAbi, parseEventLogs, type Address, type Hex } from "viem";

import {
  agentAccount,
  networkName,
  publicClient,
  walletClient,
  type NetworkName,
} from "./celo";

// ERC-8004 identity for the nomai Agent (docs/erc8004-registration.md).
//
// The registry mints an ERC-721 to `msg.sender` and publishes that address as
// the agent's wallet, so the registering key IS the identity's owner. The whole
// project is one agent: ADR-0003's amendment rules out a per-Traveler identity,
// and the Agent wallets are payment accounts, not service endpoints.
//
// Celo deploys the same registry at a fixed address per network. The CAIP-10
// form (`eip155:<chainId>:<registry>`) is what the registration JSON advertises.

export const IDENTITY_REGISTRY: Record<NetworkName, Address> = {
  sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  mainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
};

export const REGISTRY_CAIP10: Record<NetworkName, string> = {
  sepolia: `eip155:11142220:${IDENTITY_REGISTRY.sepolia}`,
  mainnet: `eip155:42220:${IDENTITY_REGISTRY.mainnet}`,
};

export const EXPLORER: Record<NetworkName, string> = {
  sepolia: "https://celo-sepolia.blockscout.com",
  mainnet: "https://celoscan.io",
};

export const identityAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

export interface AgentIdentity {
  agentId: bigint;
  owner: Address;
  agentURI: string;
  /** Registry-published payment wallet (ERC-8004 `agentWallet`). */
  agentWallet?: Address;
}

export interface RegisterResult extends AgentIdentity {
  hash: Hex;
  tag: string;
  explorer: string;
}

export const txUrl = (network: NetworkName, hash: string) =>
  `${EXPLORER[network]}/tx/${hash}`;

/**
 * The attribution suffix cannot be backfilled onto a mined tx, so a send with
 * no tag is a wasted mint for this hackathon entry. Refuse before signing.
 */
function requireTag(): string {
  const tag = process.env.CELO_ATTRIBUTION_TAG?.trim();
  if (!tag) {
    throw new Error(
      "CELO_ATTRIBUTION_TAG is not set — an untagged tx cannot be tagged later, so this refuses to sign.",
    );
  }
  return tag;
}

/** The URI is baked into the minted identity; it must be a public https URL. */
function requireHttps(uri: string): string {
  if (!/^https:\/\/[^\s]+$/.test(uri)) {
    throw new Error(
      `agentURI must be a public https URL (got ${JSON.stringify(uri)}) — a local path or data: URI leaves the identity pointing nowhere.`,
    );
  }
  return uri;
}

/** Identities `owner` holds. Anything above 0 means "already registered". */
export async function identityBalance(
  owner: Address,
  network: NetworkName = networkName(),
): Promise<bigint> {
  return publicClient(network).readContract({
    address: IDENTITY_REGISTRY[network],
    abi: identityAbi,
    functionName: "balanceOf",
    args: [getAddress(owner)],
  });
}

export async function readIdentity(
  agentId: bigint,
  network: NetworkName = networkName(),
): Promise<AgentIdentity> {
  const client = publicClient(network);
  const registry = IDENTITY_REGISTRY[network];
  const [owner, agentURI] = await Promise.all([
    client.readContract({
      address: registry,
      abi: identityAbi,
      functionName: "ownerOf",
      args: [agentId],
    }),
    client.readContract({
      address: registry,
      abi: identityAbi,
      functionName: "tokenURI",
      args: [agentId],
    }),
  ]);
  // agentWallet is part of the ERC-8004 surface but optional in practice; a
  // missing getter must not hide the identity itself.
  let agentWallet: Address | undefined;
  try {
    agentWallet = await client.readContract({
      address: registry,
      abi: identityAbi,
      functionName: "getAgentWallet",
      args: [agentId],
    });
  } catch {
    agentWallet = undefined;
  }
  return { agentId, owner, agentURI, agentWallet };
}

/**
 * Validations + simulation for a mint, with no send. Shared by `registerAgent`
 * and the script's `--dry-run`, so a revert costs nothing and the dry run
 * exercises exactly the same guards.
 */
export async function simulateRegister(
  agentURI: string,
  network: NetworkName = "mainnet",
) {
  const tag = requireTag();
  requireHttps(agentURI);
  const account = agentAccount();
  const client = publicClient(network);

  // `register` mints an NFT every call: a second run without the persisted id
  // would duplicate the identity, which is the one mistake that costs a real
  // mint to undo. The balance is the guard.
  const owned = await identityBalance(account.address, network);
  if (owned > 0n) {
    throw new Error(
      `${account.address} already owns ${owned} ERC-8004 identit${owned === 1n ? "y" : "ies"} on ${network} — refusing to mint a duplicate. Recover the agentId (8004scan, or the Registered event with owner=${account.address}) and set ERC8004_AGENT_ID.`,
    );
  }

  const { request, result } = await client.simulateContract({
    account,
    address: IDENTITY_REGISTRY[network],
    abi: identityAbi,
    functionName: "register",
    args: [agentURI],
  });

  // Reported by --dry-run; `simulateContract` does not include it.
  const gas = await client.estimateContractGas({
    account,
    address: IDENTITY_REGISTRY[network],
    abi: identityAbi,
    functionName: "register",
    args: [agentURI],
  });

  return { tag, account, client, request, simulatedAgentId: result, gas };
}

/**
 * `register(agentURI)` from the project wallet and recover the agentId from the
 * mined `Registered` event. The simulation's return value is `_lastId` at
 * simulate time — another registration in between invalidates it, so it is
 * never trusted.
 */
export async function registerAgent(
  agentURI: string,
  network: NetworkName = "mainnet",
): Promise<RegisterResult> {
  const { tag, client, request } = await simulateRegister(agentURI, network);

  const hash = await walletClient(network).writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`register reverted on ${network} (${txUrl(network, hash)})`);
  }

  const [event] = parseEventLogs({
    abi: identityAbi,
    eventName: "Registered",
    logs: receipt.logs,
  });
  if (!event) {
    throw new Error(
      `tx ${hash} mined without a Registered event — cannot recover the agentId. Inspect it: ${txUrl(network, hash)}`,
    );
  }

  const attribution = await verifyTx({ client, hash });
  if (!attribution?.codes.includes(tag)) {
    throw new Error(
      `tx ${hash} is on chain but does not carry CELO_ATTRIBUTION_TAG ${tag} (codes: ${attribution?.codes.join(", ") ?? "none"}). The identity exists; the entry will not get credit for it.`,
    );
  }

  return {
    agentId: event.args.agentId,
    owner: event.args.owner,
    agentURI,
    agentWallet: undefined,
    hash,
    tag,
    explorer: txUrl(network, hash),
  };
}

/** Repoint an existing identity (e.g. the API moves to a new domain). */
export async function setAgentURI(
  agentId: bigint,
  newURI: string,
  network: NetworkName = "mainnet",
): Promise<{ hash: Hex | null; explorer?: string }> {
  const tag = requireTag();
  requireHttps(newURI);
  const account = agentAccount();
  const client = publicClient(network);
  const current = await readIdentity(agentId, network);

  if (getAddress(current.owner) !== account.address) {
    throw new Error(
      `agentId ${agentId} is owned by ${current.owner}, not ${account.address} — only the owner can setAgentURI.`,
    );
  }
  if (current.agentURI === newURI) return { hash: null };

  const { request } = await client.simulateContract({
    account,
    address: IDENTITY_REGISTRY[network],
    abi: identityAbi,
    functionName: "setAgentURI",
    args: [agentId, newURI],
  });
  const hash = await walletClient(network).writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`setAgentURI reverted (${txUrl(network, hash)})`);
  }

  const attribution = await verifyTx({ client, hash });
  if (!attribution?.codes.includes(tag)) {
    throw new Error(
      `tx ${hash} does not carry CELO_ATTRIBUTION_TAG ${tag} (codes: ${attribution?.codes.join(", ") ?? "none"}).`,
    );
  }
  return { hash, explorer: txUrl(network, hash) };
}
