// Operate the shared Escrow vault (issue #57) — the manual releases,
// refunds and the Service-fee withdrawal of the demo (ADR-0006).
//
//   pnpm escrow:admin [--network sepolia|mainnet] <command> [args]
//
// Commands:
//   admin                          show the vault's admin / pendingAdmin
//   balance <token>                vault balance of a token
//   transfer <token> <to> <amount> admin-only vault.transfer — release to the
//                                  Owner, refund to the Traveler, or the
//                                  Service-fee withdrawal. <amount> is in
//                                  human units, converted by the token's
//                                  decimals.
//   nominate-admin <address>       start the two-step admin handover
//   accept-admin                   candidate completes the handover
//
// <token> is a symbol from the src/x402.ts asset table (usdc, wars, wbrl, …)
// or a raw 0x address (decimals read on-chain). Default network: sepolia.
//
// Writes additionally need:
//   ESCROW_ADMIN_PRIVATE_KEY — project wallet key, operator-supplied at
//       invocation ONLY; derived address must equal the vault's admin.
//   CELO_ATTRIBUTION_TAG — the celo_… ERC-8021 code on every send.

import "dotenv/config";
import { encodeFunctionData, formatUnits, getAddress, isAddress, parseUnits } from "viem";
import {
  adminAccount,
  attributedWallet,
  compileVault,
  erc20Balance,
  escrowAddress,
  explorerTx,
  netConfig,
  parseArgs,
  publicClientFor,
  resolveToken,
  tokenDecimals,
  txAttribution,
} from "./escrow-lib.js";

const USAGE = `usage: pnpm escrow:admin [--network sepolia|mainnet] <command> [args]
  admin | balance <token> | transfer <token> <to> <amount> | nominate-admin <address> | accept-admin`;

async function main() {
  const { network, rest } = parseArgs(process.argv.slice(2));
  const [command, ...args] = rest;
  const cfg = netConfig(network);
  const client = publicClientFor(network);
  const vault = escrowAddress();
  const { abi } = compileVault();

  switch (command) {
    case "admin": {
      const [admin, pending] = await Promise.all([
        client.readContract({ address: vault, abi, functionName: "admin" }),
        client.readContract({ address: vault, abi, functionName: "pendingAdmin" }),
      ]);
      console.log(`vault        : ${vault} (${cfg.name})`);
      console.log(`admin        : ${admin}`);
      console.log(`pendingAdmin : ${pending}`);
      return;
    }

    case "balance": {
      const [ref] = args;
      if (!ref) throw new Error(USAGE);
      const token = resolveToken(network, ref);
      const decimals = await tokenDecimals(client, token);
      const bal = await erc20Balance(client, token.address, vault);
      console.log(
        `${token.symbol} @ ${token.address}\n` +
          `  vault balance: ${formatUnits(bal, decimals)}`
      );
      return;
    }

    case "transfer": {
      const [ref, to, amount] = args;
      if (!ref || !to || !amount) throw new Error(USAGE);
      if (!isAddress(to)) throw new Error(`invalid recipient "${to}"`);
      const token = resolveToken(network, ref);
      const decimals = await tokenDecimals(client, token);
      const atomic = parseUnits(amount, decimals);
      if (atomic <= 0n) throw new Error("amount must be > 0");

      const bal = await erc20Balance(client, token.address, vault);
      if (atomic > bal) {
        throw new Error(
          `vault holds ${formatUnits(bal, decimals)} ${token.symbol} — ` +
            `cannot send ${amount}`
        );
      }

      await send("transfer", [token.address, getAddress(to), atomic]);
      const after = await erc20Balance(client, token.address, vault);
      console.log(`  vault balance after: ${formatUnits(after, decimals)} ${token.symbol}`);
      return;
    }

    case "nominate-admin": {
      const [candidate] = args;
      if (!candidate || !isAddress(candidate))
        throw new Error(`usage: nominate-admin <0x address>`);
      await send("nominateAdmin", [getAddress(candidate)]);
      return;
    }

    case "accept-admin": {
      await send("acceptAdmin", [], "pendingAdmin");
      return;
    }

    default:
      throw new Error(USAGE);
  }

  /** Every write: key, attribution tag, wait, report. `expected` is the role
   * the call needs — "admin" for transfer/nominateAdmin, "pendingAdmin" for
   * acceptAdmin (the candidate completes the handover). */
  async function send(
    functionName: string,
    callArgs: readonly unknown[],
    expected: "admin" | "pendingAdmin" = "admin"
  ) {
    const account = adminAccount();
    const expectedAddr = (await client.readContract({
      address: vault,
      abi,
      functionName: expected,
    })) as string;
    if (getAddress(account.address) !== getAddress(expectedAddr)) {
      throw new Error(
        `the admin key derives to ${account.address} but the vault's ` +
          `${expected} is ${expectedAddr} — refusing to send a call that would revert`
      );
    }
    const wallet = attributedWallet(network, account);
    const hash = await wallet.sendTransaction({
      to: vault,
      // The tag lands as the tail of `data`; the callee decodes its args at
      // fixed offsets and ignores the suffix.
      data: encodeFunctionData({ abi, functionName, args: callArgs }),
    });
    console.log(`tx: ${explorerTx(network, hash)}`);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} reverted — status ${receipt.status}`);
    }
    const attribution = await txAttribution(client, hash);
    const tagged = attribution?.codes.includes(
      process.env.CELO_ATTRIBUTION_TAG ?? ""
    );
    console.log(`  ${functionName} confirmed${tagged ? ` (tag: ${attribution!.codes.join(", ")})` : ""}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
