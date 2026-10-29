import { defineTool } from "eve/tools";
import { formatUnits, getAddress, parseAbi } from "viem";
import { z } from "zod";

import { agentAccount, networkName, NETWORK_CAIP2, publicClient, TOKENS } from "../lib/celo";

const ERC20_BALANCE = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

// Read-only balance check for the PROJECT wallet (or any address) on the
// configured Celo network: native CELO plus every facilitator-supported token.
// Not the Traveler's Agent wallet — their saldo is check_wallet's job.

export default defineTool({
  description:
    "Check the project wallet's CELO and supported token balances on the configured Celo network (sepolia or mainnet). This is NOT the Traveler's Agent wallet that pays Bookings — use check_wallet for their saldo. Optionally check another address instead.",
  inputSchema: z.object({
    address: z
      .string()
      .optional()
      .describe("Address to inspect; defaults to the project wallet (CELO_PRIVATE_KEY)."),
  }),
  execute: async ({ address }) => {
    const network = networkName();
    const owner = getAddress(address ?? agentAccount().address);
    const client = publicClient(network);

    const native = await client.getBalance({ address: owner });
    const tokens: Record<string, string> = {};
    await Promise.all(
      Object.entries(TOKENS[network]).map(async ([symbol, token]) => {
        const raw = await client.readContract({
          address: token.address,
          abi: ERC20_BALANCE,
          functionName: "balanceOf",
          args: [owner],
        });
        tokens[symbol.toUpperCase()] = formatUnits(raw, token.decimals);
      }),
    );

    return {
      address: owner,
      network,
      caip2: NETWORK_CAIP2[network],
      celo: formatUnits(native, 18),
      tokens,
    };
  },
});
