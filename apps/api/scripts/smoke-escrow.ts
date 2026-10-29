// Local verification of the Escrow vault (issue #57) on an in-process
// ganache chain — no funds, no network beyond the machine. Run:
//
//   pnpm smoke:escrow
//
//   ESCROW_ADMIN_PRIVATE_KEY — optional; when set (sourced from
//       apps/agent/.env) the vault deploys from the real project wallet, so
//       admin == 0x8BCF…731C is asserted too. Otherwise a well-known dev key
//       stands in — it only exists inside this throwaway chain.
//   CELO_ATTRIBUTION_TAG — optional; falls back to the project's code so the
//       ERC-8021 suffix path is exercised either way.
//
// What it proves (the on-chain acceptance criteria, minus real funds):
//   1. solc compiles Escrow.sol + the test tokens (same helper as deploy)
//   2. a deploy sent WITH the attribution tag lands a working contract —
//      the tag sits as inert trailing initcode because the constructor
//      takes no args
//   3. admin() == the deployer
//   4. a plain ERC-20 transfer deposits into the vault — the x402 settle
//      shape: no hook, no function call on the vault
//   5. admin transfer moves funds out and emits Transferred
//   6. a non-admin transfer reverts (simulateContract — no funds needed)
//   7. the safe-transfer path handles a token that returns no bool
//   8. the two-step admin handover works
//   9. every sent tx carries the attribution tag (verifyTx)

import ganache from "ganache";
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { verifyTx, withAttribution } from "@celo/attribution-tags";
import { compileAll, PROJECT_WALLET } from "./escrow-lib.js";

/** keccak256("NotAdmin()")[:4] — the custom-error selector in revert data.
 * Checked by bytes (not by message) because some RPCs wrap the decoded error
 * (ganache answers "Missing or invalid parameters"). */
const NOT_ADMIN = toFunctionSelector("NotAdmin()");

/** True when a viem error chain carries our NotAdmin revert — by selector in
 * the revert data, or by the decoded name where the RPC returns it. */
const revertedNotAdmin = (e: unknown): boolean => {
  const hay =
    String(e) +
    JSON.stringify(e, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  return hay.includes(NOT_ADMIN) || hay.includes("NotAdmin");
};

// Well-known dev keys (hardhat accounts #0/#1) — public, test-only, used
// ONLY inside this throwaway chain when the real admin key isn't passed.
const DEV_ADMIN_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const DEV_OUTSIDER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const assert = (cond: boolean, msg: string) => (cond ? ok(msg) : fail(msg));

const balanceOf = (
  client: ReturnType<typeof createPublicClient>,
  token: Address,
  owner: Address
) =>
  client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });

async function main() {
  const rawKey = process.env.ESCROW_ADMIN_PRIVATE_KEY?.trim();
  const adminKey = (
    rawKey
      ? rawKey.startsWith("0x")
        ? rawKey
        : `0x${rawKey}`
      : DEV_ADMIN_KEY
  ) as Hex;
  const admin = privateKeyToAccount(adminKey);
  const outsider = privateKeyToAccount(DEV_OUTSIDER_KEY);
  const tag = process.env.CELO_ATTRIBUTION_TAG ?? "celo_40fb48026a9f";
  ok(
    rawKey
      ? "deploying from the real project-wallet key"
      : "no ESCROW_ADMIN_PRIVATE_KEY — using a dev key"
  );

  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: {
      accounts: [
        { secretKey: adminKey, balance: "0x56BC75E2D63100000" }, // 100 ETH
        { secretKey: DEV_OUTSIDER_KEY, balance: "0x56BC75E2D63100000" },
      ],
    },
  });
  try {
    const chainId = Number(await provider.request({ method: "eth_chainId" }));
    const chain = defineChain({
      id: chainId,
      name: "escrow-smoke",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [] } },
    });
    const client = createPublicClient({
      chain,
      transport: custom(provider, { retryCount: 0 }),
    });
    const wallet = (account: PrivateKeyAccount) =>
      createWalletClient({
        account,
        chain,
        transport: custom(provider, { retryCount: 0 }),
      }).extend(withAttribution(tag));
    const adminWallet = wallet(admin);
    const outsiderWallet = wallet(outsider);

    const send = (
      w: ReturnType<typeof wallet>,
      args: { to?: Address; data: Hex }
    ) => w.sendTransaction(args) as Promise<Hex>;
    const mine = (hash: Hex) => client.waitForTransactionReceipt({ hash });
    const call = (w: ReturnType<typeof wallet>, to: Address, data: Hex) =>
      send(w, { to, data }).then(mine);

    // -- compile ---------------------------------------------------------------
    step("compile Escrow.sol + test tokens via pinned solc");
    const contracts = compileAll(["Escrow.sol", "test/LocalTokens.sol"]);
    for (const name of ["EscrowVault", "SmokeUSD", "SmokeARS"]) {
      assert(Boolean(contracts[name]?.bytecode), `${name} compiled`);
    }
    const vaultAbi = contracts.EscrowVault.abi;

    // -- deploy the vault (tagged) ---------------------------------------------
    step("deploy EscrowVault with the attribution tag in the tx input");
    const deployHash = await send(adminWallet, {
      data: contracts.EscrowVault.bytecode,
    });
    const deployReceipt = await mine(deployHash);
    const vault = deployReceipt.contractAddress as Address;
    assert(
      deployReceipt.status === "success" && Boolean(vault),
      `deployed at ${vault ?? "?"} (tagged initcode lands a working contract)`
    );
    if (!vault) throw new Error("deploy failed — nothing left to verify");
    const deployAttr = await verifyTx({ client, hash: deployHash });
    assert(
      deployAttr?.codes.includes(tag) === true,
      `deploy tx tag: ${deployAttr?.codes.join(", ") ?? "none"}`
    );

    const adminOnChain = await client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "admin",
    });
    assert(
      getAddress(adminOnChain as string) === admin.address,
      `admin() == deployer ${adminOnChain}`
    );
    if (rawKey) {
      assert(
        getAddress(adminOnChain as string) === PROJECT_WALLET,
        `admin() == the project wallet`
      );
    }

    // -- deploy the test tokens from the "Traveler" ------------------------------
    step("deploy test tokens (bool + USDT-style no-bool), supply to the payer");
    const deployToken = async (name: "SmokeUSD" | "SmokeARS") => {
      const hash = await send(outsiderWallet, {
        data: contracts[name].bytecode,
      });
      const receipt = await mine(hash);
      return {
        address: receipt.contractAddress as Address,
        status: receipt.status,
        attr: await verifyTx({ client, hash }),
      };
    };
    const tokenA = await deployToken("SmokeUSD");
    const tokenB = await deployToken("SmokeARS");
    assert(
      tokenA.status === "success" && tokenB.status === "success",
      `tokens deployed (${tokenA.address}, ${tokenB.address})`
    );
    assert(
      tokenA.attr?.codes.includes(tag) === true,
      `token deploy tagged: ${tokenA.attr?.codes.join(", ") ?? "none"}`
    );

    // -- plain ERC-20 transfer deposits ------------------------------------------
    step("plain ERC-20 transfer deposits into the vault (x402 settle shape)");
    const DEPOSIT = 5_000_000n; // 5 sUSD
    const payHash = await send(outsiderWallet, {
      to: tokenA.address,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [vault, DEPOSIT],
      }),
    });
    await mine(payHash);
    const vaultBal = await balanceOf(client, tokenA.address, vault);
    assert(
      vaultBal === DEPOSIT,
      `vault holds ${formatUnits(vaultBal, 6)} sUSD after a raw transfer`
    );

    // -- admin transfer out --------------------------------------------------------
    step("admin transfer routes funds out + emits Transferred");
    const OUT = 2_000_000n; // 2 sUSD — e.g. a release to the Owner
    const releaseHash = await send(adminWallet, {
      to: vault,
      data: encodeFunctionData({
        abi: vaultAbi,
        functionName: "transfer",
        args: [tokenA.address, outsider.address, OUT],
      }),
    });
    const releaseReceipt = await mine(releaseHash);
    assert(releaseReceipt.status === "success", "admin transfer mined");
    const ev = releaseReceipt.logs
      .filter((l) => l.address.toLowerCase() === vault.toLowerCase())
      .map((l) => {
        try {
          return decodeEventLog({
            abi: vaultAbi,
            data: l.data,
            topics: l.topics,
          });
        } catch {
          return null;
        }
      })
      .find((e) => e?.eventName === "Transferred");
    const evArgs = ev?.args as
      | { token?: string; to?: string; amount?: bigint }
      | undefined;
    assert(
      getAddress(evArgs?.to ?? "") === outsider.address &&
        evArgs?.amount === OUT,
      `Transferred(token=${evArgs?.token}, to=${evArgs?.to}, amount=${evArgs?.amount})`
    );
    const [vaultAfter, recipBal] = await Promise.all([
      balanceOf(client, tokenA.address, vault),
      balanceOf(client, tokenA.address, outsider.address),
    ]);
    // outsider holds the minted supply minus what it paid in, plus the release.
    const SUPPLY_A = 1_000_000_000_000n;
    assert(
      vaultAfter === DEPOSIT - OUT && recipBal === SUPPLY_A - DEPOSIT + OUT,
      `balances moved (vault ${formatUnits(vaultAfter, 6)}, recipient ${formatUnits(recipBal, 6)})`
    );
    const releaseAttr = await verifyTx({ client, hash: releaseHash });
    assert(
      releaseAttr?.codes.includes(tag) === true,
      `release tx tag: ${releaseAttr?.codes.join(", ") ?? "none"}`
    );

    // -- non-admin reverts -----------------------------------------------------------
    step("non-admin transfer reverts (simulateContract — no funds needed)");
    let reverted = false;
    try {
      await client.simulateContract({
        address: vault,
        abi: vaultAbi,
        functionName: "transfer",
        args: [tokenA.address, outsider.address, 1n],
        account: outsider.address,
      });
    } catch (e) {
      reverted = revertedNotAdmin(e);
    }
    assert(reverted, "NotAdmin revert for a non-admin call");

    // -- no-bool token -----------------------------------------------------------------
    step("safe-transfer handles a token that returns no bool");
    const IN_B = 7n * 10n ** 18n;
    const OUT_B = 3n * 10n ** 18n;
    await call(
      outsiderWallet,
      tokenB.address,
      encodeFunctionData({
        abi: contracts.SmokeARS.abi,
        functionName: "transfer",
        args: [vault, IN_B],
      })
    );
    const balVaultB = await balanceOf(client, tokenB.address, vault);
    assert(
      balVaultB === IN_B,
      `no-bool token deposited (${formatUnits(balVaultB, 18)} sARS)`
    );
    const outBHash = await send(adminWallet, {
      to: vault,
      data: encodeFunctionData({
        abi: vaultAbi,
        functionName: "transfer",
        args: [tokenB.address, outsider.address, OUT_B],
      }),
    });
    const outBReceipt = await mine(outBHash);
    const outBBal = await balanceOf(client, tokenB.address, vault);
    assert(
      outBReceipt.status === "success" && outBBal === IN_B - OUT_B,
      `vault transferred a no-bool token out (${formatUnits(outBBal, 18)} sARS left)`
    );

    // -- two-step handover --------------------------------------------------------------
    step("two-step admin handover");
    await call(
      adminWallet,
      vault,
      encodeFunctionData({
        abi: vaultAbi,
        functionName: "nominateAdmin",
        args: [outsider.address],
      })
    );
    await call(
      outsiderWallet,
      vault,
      encodeFunctionData({
        abi: vaultAbi,
        functionName: "acceptAdmin",
        args: [],
      })
    );
    const newAdmin = await client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: "admin",
    });
    assert(
      getAddress(newAdmin as string) === outsider.address,
      `admin now ${newAdmin}`
    );
    let oldReverted = false;
    try {
      await client.simulateContract({
        address: vault,
        abi: vaultAbi,
        functionName: "transfer",
        args: [tokenA.address, outsider.address, 1n],
        account: admin.address,
      });
    } catch (e) {
      oldReverted = revertedNotAdmin(e);
    }
    assert(oldReverted, "previous admin can no longer route funds");

    console.log(
      failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`
    );
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await provider.disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
