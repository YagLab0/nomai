// ERC-8004 registration document for the nomai Agent, served at
// /.well-known/agent.json (docs/erc8004-registration.md).
//
// The Identity Registry stores this document's URL as the identity's
// `agentURI`; 8004scan and other agents dereference it to discover what the
// agent is and where it lives. One identity for the whole project (ADR-0003
// amendment) — the Traveler Agent wallets are payment accounts, not agents
// with endpoints of their own.
//
// `AGENT_ID` is the minted id from `pnpm --filter agent erc8004`. Keep it in
// sync with the registry; ERC8004_AGENT_ID overrides it at runtime so a
// deployment can be repointed without a code change.

/** Celo mainnet Identity Registry (eip155:42220). */
export const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

/** CAIP-10 form the spec expects in `registrations[].agentRegistry`. */
export const AGENT_REGISTRY_CAIP10 = `eip155:42220:${IDENTITY_REGISTRY}`;

/**
 * Minted agentId of the project wallet, or null before the registration tx.
 * Set this after running the register script on mainnet.
 */
export const AGENT_ID: number | null = null;

function runtimeAgentId(): number | null {
  const fromEnv = Number(process.env.ERC8004_AGENT_ID ?? '');
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : AGENT_ID;
}

/**
 * The registration JSON. `origin` is the public web origin serving this file —
 * endpoints are absolute, so they must be derived from the request rather than
 * hardcoded (the same build answers on a preview and a custom domain).
 */
export function agentRegistrationDocument(origin: string) {
  const base = origin.replace(/\/+$/, '');
  const agentId = runtimeAgentId();

  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Nomai Traveler Agent (Nomito)',
    description:
      'Agente de viajes: busca Lodgings, cotiza en moneda local y paga Bookings en wFIAT sobre x402, con los fondos en el escrow del Booking.',
    image: `${base}/apple-icon.png`,
    services: [
      { name: 'web', endpoint: base },
      { name: 'MCP', endpoint: `${base}/api/mcp`, version: '2025-06-18' },
    ],
    x402Support: true,
    active: true,
    supportedTrust: ['reputation'],
    ...(agentId
      ? { registrations: [{ agentId, agentRegistry: AGENT_REGISTRY_CAIP10 }] }
      : {}),
  };
}
