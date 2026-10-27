// The buyer side — this is what an agent does.
//
// `wrapFetchWithPaymentFromConfig` returns an ordinary `fetch`. Call a 402-protected
// URL with it and the payment happens inside: it reads the requirements off the 402,
// signs an EIP-3009 authorization, and retries. Your code sees one request.
//
// Run it against the seller in this same repo:
//   pnpm api:dev      # terminal 1
//   pnpm api:buy      # terminal 2
//
// The wallet needs USDC and NOTHING ELSE. No CELO — the facilitator pays the gas.

import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { CAIP2, CONFIG, NETWORK } from "./x402.js";

const key = process.env.BUYER_PRIVATE_KEY;
if (!key) {
  console.error("BUYER_PRIVATE_KEY is not set. Copy .env.template to .env first.");
  process.exit(1);
}

const account = privateKeyToAccount(key as `0x${string}`);
const payFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: CAIP2, client: new ExactEvmScheme(account) }],
});

// /paid is retired (D4) — the only x402-gated route left is the Booking
// endpoint POST /listings/:slug/book. SELLER_URL defaults to /free, which
// exercises the same paying fetch against an open route (no payment-response
// header comes back); point it at a book URL to see a real settlement.
const url = process.env.SELLER_URL ?? "http://localhost:3001/free";

console.log(`paying as ${account.address} on ${NETWORK}`);
console.log(`calling  ${url}`);

// GET matches the /free default; override SELLER_METHOD too when pointing
// at the Booking endpoint (POST /listings/:slug/book needs a JSON body —
// this script stays a connectivity probe, not a booking client).
const res = await payFetch(url, {
  method: process.env.SELLER_METHOD ?? "GET",
});
console.log(`\nHTTP ${res.status}`);
console.log(await res.text());

// The receipt rides back on this header. It carries the settlement transaction hash,
// which is the only proof that anything actually moved on chain.
const receipt = res.headers.get("payment-response");
if (receipt) {
  const decoded = JSON.parse(
    Buffer.from(receipt, "base64").toString("utf8")
  ) as { transaction?: string };
  console.log("\nsettlement:", decoded);
  if (decoded.transaction) {
    console.log(`${CONFIG.explorer}/tx/${decoded.transaction}`);
  }
} else {
  console.log("\nNo payment-response header — the route answered without charging.");
}
