```
---
name: x402-celo-facilitator
description: Integrate x402 stablecoin payments into any web service using the hosted x402 facilitator on Celo. Use this when adding pay-per-request billing to an API or when building a client that pays for x402-protected endpoints. Covers the seller flow (charge for your API with the @x402/hono or @x402/express v2 middleware + @x402/core + @x402/evm) and the buyer flow (pay automatically with @x402/fetch + @x402/evm), pointed at the Celo facilitator at api.x402.celo.org.
license: MIT
---

# x402 payments on Celo — integration skill

This skill lets an agent add x402 stablecoin payments to a project using a hosted
facilitator on the Celo network. x402 is an open standard: a server answers a
request with HTTP `402 Payment Required` and a machine-readable price; the client
signs a stablecoin payment; a **facilitator** verifies the signature and settles it
on-chain. The end user pays no gas — settlement gas is paid by the facilitator, and for
the Permit2 assets the hosted facilitator also sponsors the Permit2 allowance — on every
payment, from a permit the buyer signs — provided the seller's route advertises it (see the
seller flow's `extensions` block and the buyer flow for how to confirm it on a deployment).

You are integrating against the hosted facilitator at:

- Frontend / dashboard: `https://x402.celo.org`
- Mainnet facilitator API: `https://api.x402.celo.org`
- Testnet facilitator API: `https://api.x402.sepolia.celo.org`

There are two roles. **Seller** (accept payments for your API) is the primary case;
**buyer** (pay for someone else's x402 API) is covered second.

---

## Prerequisites (the human does this once)

The facilitator is metered: each on-chain settlement is charged gas at cost plus 0.3% of the payment value, or gas only when the asset has no USD price
(wARS, wMXN, wPEN and wCLP, which have no USD feed, always; wBRL, wCOP and cNGN while their feed reading is stale; see
`feeApplies` on each entry of `paymentAssets` in `/api/config`), debited from a prepaid balance (free credits are spent first, one settlement each). To
get a key, the human — not the agent — must:

1. Open `https://x402.celo.org` and connect an EVM wallet (MetaMask, etc.).
2. Click **Create API key** and sign the message (no gas, no transaction). If it offers
   **Sign in with GitHub**, take it to get the mainnet free credits; **Skip** gives the
   testnet free credits alone, and GitHub cannot be added to that key later.
3. Copy the key (shown once) — it looks like `x402_...`.
4. Provide it to the project as the `X402_API_KEY` environment variable.

New accounts start with free credits (mainnet + testnet). After those, the human deposits
USDC on the dashboard and it becomes a balance in USD, not a count of credits; the exact
charge model is served at `GET /api/config` under `pricing`. The key is shown only once;
if it is lost, click **Lost your key? Regenerate it** on the dashboard to issue a new one
(this invalidates the old key; credits and balance are preserved). Do **not** try to mint keys programmatically or
handle the user's wallet — read the key from the environment.

If a deployment script genuinely has to mint a key without the dashboard, the flow is
three calls on the facilitator host, documented in the repo's `docs/RESOURCE_SERVER.md`
("Getting a key without the dashboard"). Two status codes to check deliberately:
`POST /api/keys` (create) answers **`201`**, `POST /api/keys/rotate` answers **`200`** —
the account already existed. Test `response.ok`, never `=== 201`: a client that insists
on `201` for rotate discards its new key while the old one is already invalid.

> The agent's job begins after `X402_API_KEY` is set. If it is missing, stop and ask
> the human to complete the steps above.

---

## Facts you must not get wrong

- **Networks:** Celo mainnet is CAIP-2 `eip155:42220`; Celo Sepolia testnet is
  `eip155:11142220`. Develop on testnet first.
- **Scheme:** `exact` (a fixed price per request), the standard x402 EVM scheme.
- **Assets:** two classes, and the table below is authoritative. **USDC, USDT and USAT**
  are 6-decimal assets settled from an EIP-3009 `transferWithAuthorization` signature.
  **wARS, wBRL, wCOP, wMXN, wPEN and wCLP** are 18-decimal assets settled via **Permit2** — the route must
  add `assetTransferMethod: "permit2"` to `extra` (see the seller flow). **cNGN** is
  Permit2 too, 6-decimal and without EIP-2612: its first payer approves Permit2 on chain. USDC is the
  default and the only asset on testnet; develop against it. Rows marked `not enabled
  yet` are documented and verified on-chain but cannot be settled by this facilitator
  today.

<!-- BEGIN GENERATED: tokens -->
<!-- Generated from tokens/registry.json by scripts/gen-tokens.mjs. Run `make tokens`. -->

| asset | network | address | `extra.name` | `extra.version` | decimals | transfer | status |
|---|---|---|---|---|---|---|---|
| USDC | Celo Mainnet `eip155:42220` | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | `USDC` | `2` | 6 | `eip3009` | enabled |
| USDT | Celo Mainnet `eip155:42220` | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | `Tether USD` | `1` | 6 | `eip3009` | enabled |
| USAT | Celo Mainnet `eip155:42220` | `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771` | `Tether America USD` | `1` | 6 | `eip3009` | enabled |
| USDC | Celo Sepolia `eip155:11142220` | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` | `USDC` | `2` | 6 | `eip3009` | enabled |
| wARS | Celo Mainnet `eip155:42220` | `0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D` | `Peso Argentino` | `1` | 18 | `permit2` | enabled |
| wBRL | Celo Mainnet `eip155:42220` | `0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0` | `Real Brasileño` | `1` | 18 | `permit2` | enabled |
| wMXN | Celo Mainnet `eip155:42220` | `0x337E7456B420bD3481e7FA61fA9850343d610d34` | `Peso Mexicano` | `1` | 18 | `permit2` | enabled |
| wCOP | Celo Mainnet `eip155:42220` | `0x8a1D45e102e886510e891d2Ec656a708991e2D76` | `Peso Colombiano` | `1` | 18 | `permit2` | enabled |
| wPEN | Celo Mainnet `eip155:42220` | `0x4F34c8b3b5FB6D98Da888F0feA543d4d9C9F2eBE` | `Sol Peruano` | `1` | 18 | `permit2` | enabled |
| wCLP | Celo Mainnet `eip155:42220` | `0x61D450a098b6a7f69fC4b98CE68198fe59768651` | `Peso Chileno` | `1` | 18 | `permit2` | enabled |
| cNGN | Celo Mainnet `eip155:42220` | `0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f` | `cNGN` | `1` | 6 | `permit2` | enabled |

<!-- END GENERATED: tokens -->

  - **USDC, USD₮ and USA₮** are in the x402 packages' default-asset table for Celo
    mainnet as of `@x402/evm` **2.26.0** (USDC alone before that, and USDC alone on
    Sepolia). The seven Permit2 assets are not, and have to be named explicitly in the
    route price (see the seller flow), with their EIP-712 domain in `extra`, plus
    `assetTransferMethod: "permit2"`. Without it the client signs a
    `TransferWithAuthorization` that those tokens cannot execute. Naming the asset
    explicitly is the right habit for all six regardless — see the warning in the seller
    flow about what a bare dollar price resolves to.
  - **`extra.name` is not the symbol.** USDT signs as `Tether USD` and USAT as
    `Tether America USD`. Using the symbol fails verification.
  - Neither USDT nor USAT exposes `version()` on-chain — both revert — and there is no
    ERC-5267 fallback: `eip712Domain()` reverts on **every** token above, USDC included.
    The values in the table are the only source. Do not try to read them from the contract
    at runtime.
  - ⚠️ **USDT and USAT each have an 18-decimal fee-currency adapter on Celo** that reports
    the **same `name()` and `symbol()`** as the real token: `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72`
    and `0x0357EE22278c922e1D36cFe6b899269b161880C4`. Quoting a price against one is a
    10^12 error. Use the addresses in the table, and check `decimals()` is 6 if you got an
    address from anywhere else.
  - USDC has an adapter too (`0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B`) but it is the
    harmless kind — it reverts on `name()`, `symbol()` and `decimals()`, so any code that
    touches it fails immediately rather than transferring the wrong amount. **Do not read
    that as "USDC has no adapter."** When walking Celo's `FeeCurrencyDirectory`, resolve
    entries by `adaptedToken()`; an empty `symbol()` means a different adapter interface,
    not the absence of one.
- **Amounts are in the token's base units, at that token's decimals** — read the
  `decimals` column, do not assume 6. USDC: `$0.01 = "10000"`. wARS (18 decimals):
  `1 wARS = "1000000000000000000"`. Always pass amounts as strings.
- **`payTo`** is the seller's own wallet address — the address that receives the USDC.
  It is **not** the facilitator and not the buyer. Funds move buyer → `payTo` directly
  inside the token contract; the facilitator never holds funds.
- **The API key goes only to the facilitator**, as `X-API-Key`, and only on requests
  the middleware sends to the facilitator. Never expose it to the browser or to buyers.

Confirm the live facilitator capabilities any time with:

```bash
curl https://api.x402.sepolia.celo.org/supported
# -> { "kinds": [ { "x402Version": 2, "scheme": "exact", "network": "eip155:11142220",
#                   "extra": { "extensions": [...], "defaultAsset": {...}, "supportedAssets": [...] } }, ... ] }
```

Each entry in `extra.supportedAssets` is `{ asset, symbol, decimals, name, version,
assetTransferMethod }`, where `name` and `version` are the token's EIP-712 domain. These two
keys are this facilitator's own; the x402 spec does not define an asset field on `/supported`.

---

## Seller flow — charge for your API (primary)

**Runnable example:** https://github.com/celo-org/x402-celo-example — a seller that
charges $0.01 USDC per request and a buyer that pays it, on Celo Sepolia through this
facilitator. Start there if you want working code before reading the rest.

Use the official x402 **v2** framework packages and point the facilitator client at
this facilitator. Do **not** hand-assemble payment payloads — the middleware builds
the correct on-the-wire shape for you.

> **Use the v2 scoped packages (`@x402/*`), not the legacy `x402-express` /
> `x402-fetch`.** The legacy packages have no Celo entry in their network enum, so they
> will not work here. Everything below is verified against `@x402/*@2.23` and settles
> real payments against this facilitator.
>
> The snippets are **TypeScript** — run them through a TS toolchain (`tsx`, `ts-node`,
> or your framework's build), not raw `node file.js`.

### Install

```bash
# Seller (Hono shown; swap @x402/hono → @x402/express for Express)
npm i @x402/hono @x402/core @x402/evm viem
```

### Configure the facilitator client

Construct an `HTTPFacilitatorClient` that adds the `X-API-Key` header on every call the
middleware makes to the facilitator. This is the one seller-side custom piece.

```ts
// x402-facilitator.ts
import { HTTPFacilitatorClient } from "@x402/core/server";

const FACILITATOR_URL =
  process.env.X402_NETWORK === "mainnet"
    ? "https://api.x402.celo.org"
    : "https://api.x402.sepolia.celo.org";

export const facilitator = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  // Attach the metering key to every facilitator request. Returns per-endpoint
  // header maps: verify / settle / supported (bazaar is optional).
  createAuthHeaders: async () => {
    const h = { "X-API-Key": process.env.X402_API_KEY! };
    return { verify: h, settle: h, supported: h };
  },
});
```

### Seller server (Hono)

The v2 API is: build an `x402ResourceServer` from the facilitator client, register the
`exact` EVM scheme, and pass **`(routes, server)`** to `paymentMiddleware` — routes
first, then the server. `payTo` and `price` live **inside** each route's `accepts`.

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { getAddress } from "viem";
import { facilitator } from "./x402-facilitator";

const NETWORK = "eip155:11142220"; // Celo Sepolia (mainnet: eip155:42220)
const USDC = getAddress("0x01C5C0122039549AD1493B8220cABEdD739BC44E"); // Sepolia USDC

const server = new x402ResourceServer(facilitator);
server.register("eip155:*", new ExactEvmScheme());

const routes = {
  "GET /premium": {
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        payTo: getAddress(process.env.SELLER_PAY_TO!), // your wallet — receives the USDC
        price: {
          amount: "10000", // $0.01 in USDC base units (6 decimals)
          asset: USDC,
          extra: { name: "USDC", version: "2" }, // EIP-712 domain for EIP-3009
        },
      },
    ],
    description: "Premium content",
  },
};

const app = new Hono();
app.use(paymentMiddleware(routes, server)); // routes FIRST, then server
app.get("/premium", (c) => c.json({ data: "this response cost $0.01" }));

serve({ fetch: app.fetch, port: 3000 });
```

> **Do not use a bare dollar price like `price: "$0.01"` on Celo.** It type-checks,
> and at request time the middleware calls `getDefaultAsset(network)` to resolve the
> token. That call **does not fail** — Celo is in the packages' default-asset table —
> so the route silently prices itself in **USDC**, whatever you meant to charge in.
> Measured on `@x402/evm` 2.26.0: `getDefaultAsset("eip155:42220")` returns USDC
> `0xcebA9300f2b948710d2653dD7B07f33A8B32118C`, 6 decimals. Always pass the explicit
> `{ amount, asset, extra: { name, version } }` price object above.

### Pricing in a Permit2 asset (mainnet)

The `permit2` rows in the table settle through Permit2 rather than EIP-3009, and the
route has to say so. Two differences from the USDC route: **18 decimals**, and
**`assetTransferMethod: "permit2"` inside `extra`**. Omit it and the client signs an
EIP-3009 `TransferWithAuthorization`, which these tokens do not implement, so
`/verify` rejects the payment.

```ts
const NETWORK = "eip155:42220"; // Celo mainnet — the Permit2 assets are mainnet-only
const WARS = getAddress("0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D"); // from the table

"GET /premium-ars": {
  accepts: [
    {
      scheme: "exact",
      network: NETWORK,
      payTo: getAddress(process.env.SELLER_PAY_TO!),
      price: {
        amount: "1000000000000000000", // 1 wARS — 18 decimals, not 6
        asset: WARS,
        extra: { name: "Peso Argentino", version: "1", assetTransferMethod: "permit2" },
      },
    },
  ],
  extensions: {
    // The other half of gas sponsoring. The facilitator advertising
    // eip2612GasSponsoring in /supported is not enough: the client signs the
    // EIP-2612 permit only when it sees this key on the 402 body, and the
    // resource server puts it there only if the route declares it.
    eip2612GasSponsoring: {
      info: { description: "The facilitator sponsors the EIP-2612 permit to Permit2.", version: "1" },
    },
  },
},
```

`name` and `version` come from the table exactly as for the EIP-3009 assets; `name` is
the token's EIP-712 domain name, not its symbol. The facilitator dispatches on
`assetTransferMethod`.

**cNGN is the exception: Permit2 without gas sponsoring.** It is a `permit2` row with
**6 decimals** and **no EIP-2612 `permit()`**. Do not declare
`extensions.eip2612GasSponsoring` on a cNGN route; `GET /api/config` marks it
`eip2612GasSponsoring: false`. A first-time cNGN payer must send
`approve(Permit2, amount)` on the cNGN contract themselves (Permit2 is
`0x000000000022D473030F116dDEE9F6B43aC78BA3`) and pays that gas. After that a payment is
a signature only, until the allowance runs out: each payment spends it, so approve for
the expected spend and approve again when it is used up.

**The `extensions` block is not optional.** The facilitator advertising
`eip2612GasSponsoring` in `/supported` is one half of the handshake; the route
repeating it on the 402 body is the other. `@x402/core` builds the body's `extensions`
from the route config only, and the buyer's `@x402/evm` client signs the EIP-2612 permit
only when it sees the key there. Without it every first-time wallet gets
`412 permit2_allowance_required` — and the error names an allowance, not the missing
key. Measured on mainnet with one wallet: `412` without the block, gasless settlement
with it.

> **Express:** identical, but import `paymentMiddleware`, `x402ResourceServer` from
> `@x402/express` and mount with `app.use(paymentMiddleware(routes, server))`.

### Environment

```bash
X402_API_KEY=x402_...                 # from the dashboard (facilitator account)
X402_NETWORK=testnet                  # testnet | mainnet
SELLER_PAY_TO=0xYourWalletThatGetsPaid
```

### What happens at runtime

1. A client requests `GET /premium` with no payment → middleware returns `402` with
   the price and payment requirements.
2. The client (a wallet or the buyer flow below) signs an EIP-3009 authorization — or
   a Permit2 transfer for the `permit2` assets — and retries with an `X-PAYMENT` header.
3. The middleware calls the facilitator's `/verify` then `/settle` (with your
   `X-API-Key`). The facilitator submits the on-chain transfer, pays gas, and returns
   once the transfer is mined with one confirmation — about 9 s today (measured p50
   8.7 s, p95 17.9 s on mainnet; the facilitator polls for the receipt every 7 s and
   settlements run one at a time per network). Each `/settle` and `/verify` response
   that reached the facilitator carries a `Server-Timing` header (`queue`, `upstream`,
   `total`, plus `chain` after a facilitator error, in ms) that says where the time went.
4. On success the middleware runs your handler and returns the response, plus an
   `X-PAYMENT-RESPONSE` header with the settlement details. USDC has moved buyer → `payTo`.
5. Your facilitator account is charged: one free credit while any remain, then gas at
   cost plus 0.3% of the payment value (gas only when the asset has no USD price) from your balance. When neither covers the next
   settlement, `/settle` returns `402` with `insufficient_credits` until you top up on the dashboard.
   Link an email under **Notifications** on the dashboard to be emailed when the
   balance runs low and when it can no longer pay for a settlement.

---

## Buyer flow — pay for an x402 API (for testing or agents that consume paid APIs)

Use the official `@x402/fetch` (v2) client to wrap `fetch`. It handles the whole
402 → sign → retry loop automatically. The buyer needs a funded wallet (the asset the
seller prices in, on the target network) and does **not** need a facilitator API key.

**Gas.** The buyer needs **no** native gas on the hosted facilitator, for every asset.
The EIP-3009 assets (USDC, USDT, USAT) settle from a signed transfer authorization. The
Permit2 assets need an allowance to the Permit2 contract
(`0x000000000022D473030F116dDEE9F6B43aC78BA3`) on each token; because the hosted
facilitator advertises `eip2612GasSponsoring` on **both** networks, the client signs an
EIP-2612 permit for exactly the payment amount and the facilitator lands it inside the
settlement — the payer sends no transaction. The permit is spent by that settlement, so
this repeats on every payment; the buyer never notices. The `@x402/evm` client does this
on its own **when the 402 body carries the key** — which is the seller's `extensions`
block above, not the facilitator's `/supported`. On the buyer side the one thing to
configure is a chain-reading signer for the scheme (`{ rpcUrl }` in the snippet below —
the permit branch reads the allowance and permit nonce before signing); on the seller
side it is the `extensions` block above. Two payments from the same wallet within a few
seconds of each other can race on the permit nonce and answer `402` once; retry.

That is a facilitator *setting*, not a token property, so confirm it on any deployment
that is not the hosted one before promising "no gas":

```bash
curl -s https://api.x402.celo.org/supported | jq .extensions
# ["eip2612GasSponsoring"]  → Permit2 assets are gasless for the payer here (hosted: yes)
# []                        → the payer must send approve(Permit2, …) once per token
#                             themselves (~51,724 gas, costs CELO), and /verify answers
#                             412 permit2_allowance_required until it lands
```

**Spend controls.** The client refuses any asset outside the library's default-asset
table *before signing*, matching **by address**. As of `@x402/evm` **2.26.0** the Celo
mainnet table holds **USDC, USD₮ and USA₮**, so routes in any of those three pay with
the stock client and need no opt-in — **up to `"$1"` per payment**. Every default asset
is also capped at `"$1"` (`DEFAULT_MAX_AMOUNT_PER_PAYMENT`, measured on `@x402/core`
2.23.0 and 2.27.0), so a route priced above 1,000,000 base units of USDC/USD₮/USA₮ is
refused before signing unless the buyer sets `spendControls.maxAmountPerPayment` to a
USD figure (the snippets below do). The **Permit2 assets (wARS, wBRL, wCOP, wMXN, wPEN, wCLP, cNGN) are not in
it**, and a route naming one of them is refused client-side. Measured on 2.26.0: the
USDC, USDT and USAT addresses resolve, the wARS address comes back `undefined`:

```
All payment requirements were rejected by spendControls: only default assets or
entries in spendControls.allowedAssets are allowed.
```

Over the default cap on a default asset (measured on mainnet, 3.05 USAT, `@x402/core`
2.27.0 — signs once `maxAmountPerPayment: "$50"` is set):

```
Failed to create payment payload: All payment requirements were rejected by
spendControls.maxAmountPerPayment ($1 …
```

> **On `@x402/evm` 2.25.0 or older, USD₮ and USA₮ still need the opt-in below.**
> [x402-foundation/x402#3457](https://github.com/x402-foundation/x402/pull/3457) added
> them to the default-asset table and shipped in **2.26.0** (2026-09-15); before that,
> the Celo mainnet table was USDC alone. Pin or upgrade deliberately — the opt-in is
> harmless on 2.26.0, so if you support both, keep it.
>
> **The Permit2 assets are not queued to follow.** The table is documented as holding
> USD-pegged assets and the client's default cap is a USD figure converted to token units
> by `decimals` alone, with no FX — so a non-USD entry would make a `"$1"` cap mean 1
> wARS. Upstream has to decide how the cap applies before a row can be added; tracked at
> [x402-foundation/x402#3505](https://github.com/x402-foundation/x402/issues/3505).
>
> Re-check against the version you have installed rather than trusting this paragraph.

Opt the asset in explicitly with an **atomic** per-payment cap. Do not use
`spendControls: false` (drops the caps on every other asset too), and do not rely on
the default `"$1"` cap for the Permit2 assets — it is a USD figure and the library has no
rate for a non-USD asset. Spend controls exist from **`@x402/core` 2.23.0**: older
clients have no asset gate and no `setSpendControls`, so on 2.17–2.22 the call below
throws and the opt-in is unnecessary. Use 2.23 or later.

```bash
npm i @x402/fetch @x402/evm viem
```

Build an `x402Client`, allow the asset, register the `exact` EVM scheme with the buyer
account, then wrap `fetch`:

```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";

const account = privateKeyToAccount(process.env.BUYER_PRIVATE_KEY as `0x${string}`);
const NETWORK = "eip155:11142220"; // Celo Sepolia (mainnet: eip155:42220)
const USDC = getAddress("0x01C5C0122039549AD1493B8220cABEdD739BC44E"); // Sepolia USDC

const client = new x402Client();
// setSpendControls, NOT the constructor: `new x402Client(config)` silently ignores a
// config object, and the rejection above stays word-for-word the same.
client.setSpendControls({
  allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: "10000" }], // atomic
  // The stock default for USDC/USDT/USAT is "$1" per payment; without this line
  // anything above it is refused before signing. A USD figure; applies to the
  // default assets, while an allowedAssets entry's atomic cap wins for its asset.
  maxAmountPerPayment: "$50",
});
// Give the scheme a way to READ the chain as well as sign. For the Permit2 assets the
// client signs the sponsored EIP-2612 permit only after reading the wallet's allowance
// and permit nonce; a bare account cannot read, so with `new ExactEvmScheme(account)`
// alone it signs no permit and every fresh wallet gets `412 permit2_allowance_required`
// (measured on mainnet, #148). `{ rpcUrl }` is the smallest fix; composing the account
// with a viem public client via `toClientEvmSigner(account, publicClient)` from
// `@x402/evm` is equivalent. EIP-3009 assets work either way.
client.register("eip155:*", new ExactEvmScheme(account, { rpcUrl: "https://forno.celo.org" }));
const payFetch = wrapFetchWithPayment(fetch, client);

// Transparently pays if the endpoint returns 402, then returns the paid response.
const res = await payFetch("https://your-server.example/premium");
console.log(res.status, await res.json());
```

Equivalent one-call form (no separate client object):

```ts
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const payFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
  spendControls: {
    allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: "10000" }],
    maxAmountPerPayment: "$50", // lifts the "$1" default on USDT/USAT; USDC stays at the atomic cap above
  },
});
```

For a Permit2 asset, list its address from the table the same way, with the cap in
that asset's 18-decimal units.

To test end-to-end: run your seller server on testnet, fund a buyer wallet with a
little testnet USDC (see "Get testnet funds" below), and call it with the buyer client
above. A successful call moves USDC on-chain and returns your protected content, with a
`payment-response` header carrying the settlement tx hash.

### Get testnet funds (Celo Sepolia)

- **Testnet USDC** (what the buyer pays with): https://faucet.circle.com/ — select
  Celo Sepolia, paste the buyer address.
- **Testnet CELO** (optional: testnet USDC is EIP-3009 and testnet advertises gas
  sponsoring, so the buyer needs none for the transfer itself): https://faucet.celo.org

---

## Verify the integration

- Seller up: `curl -i https://your-server/premium` → `402`. The payment requirements
  come back in the **`payment-required` response header** (base64-encoded JSON with
  scheme `exact`, network, `payTo`, `asset`, atomic `amount`, and the EIP-712 domain);
  the response body is an empty `{}`. The stock client reads the header for you — you
  only need to decode it if inspecting the 402 by hand.
- Facilitator reachable: `curl https://api.x402.sepolia.celo.org/supported`
  → `200` listing the `exact` scheme for `eip155:11142220`.
- Full loop: the buyer client above returns `200` and the response contains a
  `payment-response` header (base64 JSON with the settlement tx hash). Check the
  dashboard — one free credit was used, or your balance dropped by gas plus 0.3% (gas only for an asset with no USD price).

## Common mistakes

- Using a bare `price: "$0.01"` on Celo. It compiles but 500s at request time (no
  default asset for Celo). Pass the explicit `{ amount, asset, extra: { name, version } }`
  price object. Amounts are **strings** in the asset's own base units — 6 decimals for
  USDC/USDT/USAT (`$0.01 = "10000"`), 18 for the Permit2 assets (wARS/wBRL/wCOP/wMXN/wPEN/wCLP).
- Pricing a `permit2` asset without `assetTransferMethod: "permit2"` in `extra`. The
  client then signs an EIP-3009 authorization the token cannot execute.
- Paying for a Permit2 asset with the stock client and no `spendControls.allowedAssets`
  opt-in. The client refuses the asset before signing, so nothing reaches the
  facilitator or its logs.
- Paying more than $1 of USDC/USDT/USAT without `spendControls.maxAmountPerPayment`.
  The stock default cap is `"$1"` per payment, and the rejection
  (`…rejected by spendControls.maxAmountPerPayment ($1 …`) happens before signing, so
  it never shows in the facilitator's logs either. Set a USD figure such as `"$50"`.
- Promising a Permit2 payer "no gas" on a self-hosted facilitator whose `/supported`
  returns `extensions: []`. The first payment needs a Permit2 approval there; the hosted
  facilitator advertises the extension on both networks.
- A Permit2 route without `extensions.eip2612GasSponsoring`. The facilitator sponsors,
  but the client never signs the permit because the 402 body did not ask for one, and
  every fresh wallet gets `412 permit2_allowance_required`. The symptom names an
  allowance; the cause is the missing key on the route.
- Using the legacy `x402-express` / `x402-fetch` packages, or the v1 call shape
  `paymentMiddleware(payTo, routes, facilitator)`. Use the v2 scoped `@x402/*` packages
  and `paymentMiddleware(routes, server)` with `payTo` inside each route's `accepts`.
- Pointing `payTo` at the facilitator or leaving it unset. `payTo` is the seller's own
  receiving wallet.
- Forgetting `createAuthHeaders`. Without the `X-API-Key` the facilitator rejects
  settlement (the metering gate returns `401`).
- Calling the facilitator's `/verify` or `/settle` directly and hand-building the
  payment body. Use the middleware; it produces the correct wire format. Only bypass it
  if you know the exact on-the-wire schema.
- Running on mainnet before testing on testnet, or before the mainnet facilitator has
  funded settlement gas.

## References

- x402 protocol site: https://x402.org
- x402 documentation: https://docs.cdp.coinbase.com/x402
- Runnable x402 example on Celo (seller + buyer): https://github.com/celo-org/x402-celo-example
- x402 GitHub (spec, packages, examples): https://github.com/coinbase/x402
- The `exact` EVM scheme spec: https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md
- EIP-3009 (transferWithAuthorization): https://eips.ethereum.org/EIPS/eip-3009
- Permit2 (the transfer path for the Ripio assets): https://github.com/Uniswap/permit2
- EIP-2612 (the permit the facilitator can sponsor): https://eips.ethereum.org/EIPS/eip-2612
- Celo network docs: https://docs.celo.org
- This facilitator's dashboard (get an API key, deposit to your balance): https://x402.celo.org

---

Built by Celo Core Co.
```