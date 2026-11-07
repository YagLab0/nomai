// Register (or inspect) the nomai project wallet as an ERC-8004 agent identity
// on Celo — see docs/erc8004-registration.md.
//
// Read-only, safe anytime:
//   pnpm --filter agent erc8004 -- --check
//
// Mint on mainnet (real gas, irreversible owner):
//   pnpm --filter agent erc8004 -- --network mainnet --confirm-mainnet
//
// Simulate without sending (no gas, no confirmation needed):
//   pnpm --filter agent erc8004 -- --dry-run
//
// Repoint an existing identity after the registration JSON moves:
//   pnpm --filter agent erc8004 -- --network mainnet --confirm-mainnet --set-uri
//
// What it does:
//   1. Reads CELO_PRIVATE_KEY (the project wallet — the identity's owner) and
//      refuses to mint a second identity if that wallet already holds one.
//   2. Simulates `register(agentURI)` so a revert costs nothing.
//   3. Signs with the attribution tag wired into the wallet client, waits, then
//      verifies the tag is really in the mined tx (it cannot be added later).
//   4. Prints the agentId — persist it as ERC8004_AGENT_ID and in the served
//      `/.well-known/agent.json` (apps/web/src/lib/agent-identity.ts).
//
// The URI must be a public https URL. Once minted the owner cannot change, but
// setAgentURI is cheap, so a wrong URI is fixable; a wrong owner is not.

import { agentAccount, type NetworkName } from "../agent/lib/celo";
import {
  EXPLORER,
  IDENTITY_REGISTRY,
  REGISTRY_CAIP10,
  identityBalance,
  readIdentity,
  registerAgent,
  setAgentURI,
  simulateRegister,
} from "../agent/lib/erc8004";

// pnpm forwards a literal `--` before user args; it means nothing here.
const argv = process.argv.slice(2).filter((a) => a !== "--");
const has = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const CHECK = has("check");
const SET_URI = has("set-uri");
const JSON_OUT = has("json");

const network: NetworkName = value("network") === "sepolia" ? "sepolia" : "mainnet";
const confirmed = has(`confirm-${network}`);

// The public origin that serves the registration JSON. nomaiapp.vercel.app is
// the web origin external clients already use (it also proxies the MCP
// surface); the API host is not a stable public domain.
const WEB_ORIGIN = (process.env.PUBLIC_WEB_URL ?? "https://nomaiapp.vercel.app").replace(
  /\/+$/,
  "",
);
const agentURI =
  value("uri") ?? process.env.ERC8004_AGENT_URI ?? `${WEB_ORIGIN}/.well-known/agent.json`;

const envAgentId = process.env.ERC8004_AGENT_ID?.trim();

const say = (line: string) => {
  if (!JSON_OUT) console.log(line);
};

async function main() {
  const account = agentAccount();

  if (CHECK) {
    const owned = await identityBalance(account.address, network);
    const identity = envAgentId
      ? await readIdentity(BigInt(envAgentId), network).catch(() => null)
      : null;
    const report = {
      network,
      owner: account.address,
      registry: IDENTITY_REGISTRY[network],
      agentRegistry: REGISTRY_CAIP10[network],
      explorer: `${EXPLORER[network]}/address/${account.address}`,
      identitiesOwned: owned.toString(),
      agentId: envAgentId ?? null,
      identity,
      agentURI,
    };
    if (JSON_OUT) console.log(JSON.stringify(report, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    else {
      say(`network        ${network}`);
      say(`owner          ${report.owner}`);
      say(`registry       ${report.registry}`);
      say(`agentRegistry  ${report.agentRegistry}`);
      say(`identities     ${report.identitiesOwned}`);
      if (identity) {
        say(`agentId        ${identity.agentId}`);
        say(`ownerOf        ${identity.owner}`);
        say(`tokenURI       ${identity.agentURI}`);
        say(`agentWallet    ${identity.agentWallet ?? "(unset)"}`);
      } else if (envAgentId) {
        say(`agentId        ${envAgentId} (ERC8004_AGENT_ID is set but unreadable on ${network})`);
      } else {
        say(`agentId        (none persisted — set ERC8004_AGENT_ID after registering)`);
      }
      say(`agentURI       ${agentURI}`);
    }
    return;
  }

  if (has("dry-run")) {
    const sim = await simulateRegister(agentURI, network);
    const report = {
      network,
      owner: sim.account.address,
      registry: IDENTITY_REGISTRY[network],
      agentURI,
      tag: sim.tag,
      simulatedAgentId: sim.simulatedAgentId.toString(),
      gas: sim.gas.toString(),
      sent: false,
    };
    if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("✔ simulation ok — nothing was sent");
      console.log(`  owner      ${report.owner}`);
      console.log(`  agentURI   ${report.agentURI}`);
      console.log(`  agentId    ${report.simulatedAgentId} (last id at simulate time — the mined event is the truth)`);
      console.log(`  gas        ${report.gas}`);
      console.log(`  tag        ${report.tag}`);
    }
    return;
  }

  if (!confirmed) {
    console.error(
      `Refusing to send on ${network} without confirmation.\n` +
        `  owner     ${account.address}\n` +
        `  registry  ${IDENTITY_REGISTRY[network]} (${REGISTRY_CAIP10[network]})\n` +
        `  agentURI  ${agentURI}\n` +
        `Re-run with --confirm-${network} to broadcast, or --check to inspect.`,
    );
    process.exit(1);
  }

  if (SET_URI) {
    if (!envAgentId) {
      console.error("--set-uri needs ERC8004_AGENT_ID set to the identity to update.");
      process.exit(1);
    }
    const { hash, explorer } = await setAgentURI(BigInt(envAgentId), agentURI, network);
    if (JSON_OUT) console.log(JSON.stringify({ changed: Boolean(hash), hash, explorer, agentURI }));
    else if (hash) console.log(`✔ agentURI updated to ${agentURI}\n  ${explorer}`);
    else console.log(`✔ agentURI already ${agentURI} — nothing to send.`);
    return;
  }

  const result = await registerAgent(agentURI, network);

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        { ...result, agentId: result.agentId.toString(), explorer: result.explorer },
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      ),
    );
    return;
  }

  console.log(`✔ ERC-8004 identity minted on ${network}`);
  console.log(`  agentId    ${result.agentId}`);
  console.log(`  owner      ${result.owner}`);
  console.log(`  agentURI   ${result.agentURI}`);
  console.log(`  tx         ${result.explorer}`);
  console.log(`  tag        ${result.tag} (verified in the mined tx)`);
  console.log("");
  console.log("Persist it:");
  console.log(`  ERC8004_AGENT_ID=${result.agentId}          # apps/agent/.env`);
  console.log(
    `  apps/web/src/lib/agent-identity.ts: AGENT_ID = ${result.agentId}   # served at ${agentURI}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
