// Deploy the shared Escrow vault — contracts/Escrow.sol (issue #57).
//
//   pnpm escrow:deploy [sepolia|mainnet]        # default: sepolia
//
// Environment (see .env.template):
//   ESCROW_ADMIN_PRIVATE_KEY — the project wallet key, operator-supplied at
//       invocation ONLY (e.g. sourced from apps/agent/.env). Never stored,
//       never printed. The derived address must equal the project wallet
//       0x8BCF…731C or the deploy aborts — the constructor sets
//       admin = msg.sender, so the deployer IS the admin.
//   CELO_ATTRIBUTION_TAG — the celo_… ERC-8021 code; required for every send,
//       untagged mainnet txs are never credited and cannot be backfilled.
//
// The vault has no constructor args on purpose: the attribution tag is
// appended to the transaction input, and Solidity reads constructor args
// from the tail of the initcode — a declared arg would decode the tag, not
// the value passed. `admin = msg.sender` + the pre-send address check is
// the real guarantee.

import "dotenv/config";
import { formatEther, getAddress } from "viem";
import {
  adminAccount,
  attributedWallet,
  attributionTag,
  compileVault,
  explorerAddress,
  explorerTx,
  netConfig,
  parseArgs,
  PROJECT_WALLET,
  publicClientFor,
  requireProjectWallet,
  txAttribution,
} from "./escrow-lib.js";

async function main() {
  const { network } = parseArgs(process.argv.slice(2));
  const cfg = netConfig(network);

  const account = adminAccount();
  requireProjectWallet(account); // derived address must be the project wallet
  attributionTag(network); // refuse to send untagged before anything else
  const client = publicClientFor(network);

  const balance = await client.getBalance({ address: account.address });
  if (balance === 0n) {
    console.error(
      `${account.address} holds 0 ${cfg.chain.nativeCurrency.symbol} on ${cfg.name}.` +
        (network === "sepolia"
          ? " Fund it at https://faucet.celo.org/celo-sepolia and retry."
          : "")
    );
    process.exit(1);
  }

  const { abi, bytecode } = compileVault();
  const wallet = attributedWallet(network, account);

  console.log(
    `deploying EscrowVault on ${cfg.name} (chain ${cfg.chain.id}) ` +
      `from ${account.address} (${formatEther(balance)} ${cfg.chain.nativeCurrency.symbol}) …`
  );
  // Contract creation = sendTransaction with initcode and no `to`. The
  // attribution tag rides as the data suffix — inert trailing initcode.
  const hash = await wallet.sendTransaction({ data: bytecode });
  console.log(`tx: ${explorerTx(network, hash)}`);

  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    console.error(`deploy failed — status ${receipt.status}`);
    process.exit(1);
  }
  const vault = getAddress(receipt.contractAddress);

  // Read admin() back — the constructor should have set the deployer.
  const admin = await client.readContract({
    address: vault,
    abi,
    functionName: "admin",
  });
  if (getAddress(admin as string) !== PROJECT_WALLET) {
    console.error(`vault admin is ${admin}, expected ${PROJECT_WALLET}`);
    process.exit(1);
  }

  const attribution = await txAttribution(client, hash);
  const tagged = attribution?.codes.includes(
    process.env.CELO_ATTRIBUTION_TAG ?? ""
  );

  console.log(`\nEscrowVault deployed`);
  console.log(`  address : ${vault}`);
  console.log(`  explorer: ${explorerAddress(network, vault)}`);
  console.log(`  admin   : ${admin}`);
  console.log(
    `  tx tag  : ${tagged ? attribution!.codes.join(", ") : "NOT FOUND — check CELO_ATTRIBUTION_TAG"}`
  );
  console.log(`\nnext: put the vault address in apps/api/.env`);
  console.log(`  ESCROW_ADDRESS=${vault}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
