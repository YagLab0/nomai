# nomai

Software for tourism businesses using agents & blockchain. A Celo/x402 application in a pnpm + Turborepo monorepo.

## Structure

- `apps/web` — Next.js 15 (App Router), React 19, Tailwind CSS 4, HeroUI v3; the Agent chat uses assistant-ui on a mock runtime (`src/lib/nomito/mock-adapter.ts`). Design spec: `docs/design/traveler-views.md`. Lodgings marketplace: `/lodgings`, `/owners/[slug]`, `/app/lodgings` (§10); Owner onboarding: `/owners/join` (§14); OAuth 2.1 consent screen for MCP clients at `/oauth/consent` (see `docs/mcp.md`). Photos live in `public/images` (credits in `CREDITS.md`). The `/api/owners/*` write routes are thin proxies to apps/api — the Supabase secret key never lives here.
- `apps/api` — Hono server implementing both halves of an x402 payment: a seller that answers `402 Payment Required` on the Booking route `POST /listings/:slug/book` (`GET /free` open; accepts any asset in `X402_ASSETS` — USDC/USDT/USAT and the Ripio wFIAT tokens on mainnet — settling to each Owner's `payout_address`) and a buyer probe (`src/buyer.ts`). Also serves the read-only **MCP server** at `POST /mcp` (Supabase-JWT Bearer + RFC 9728 OAuth metadata — `docs/mcp.md`) and the Bearer-authed **Owner write surface** at `/owners` (`src/owners.ts` — Lodging CRUD/status via the service_role RPCs, Storage photo uploads, and onboarding claim; user-session writes run on a JWT-scoped client so RLS still applies). Also home to the shared **Escrow vault** (`contracts/Escrow.sol`, the minimal ADR-0006 reading) and its ops scripts (`scripts/escrow-*.ts`, `smoke:escrow`) — compiled in-script by the pinned `solc` package, no committed artifact, no Foundry/Hardhat
- `apps/agent` — the Agent itself, an [eve](https://eve.dev) app: model via OpenCode Go (default `deepseek-v4.1-flash`), wallet + facilitator config in `agent/lib/celo.ts`, seller-side x402 wire format in `agent/lib/x402.ts`, and the tools in `agent/tools/`: `book_listing` (the Booking payment primitive — pays the Booking's 402 from the *Traveler's* Agent wallet via `POST /wallet/:id/payment-auth`, settling into the Escrow vault), `check_wallet` (Traveler saldo), `check_balance` / `pay_endpoint` (the *project* wallet — dormant for Bookings)

`X402_SETUP.md` explains the payment flow and facilitator setup. The buyer needs no CELO — the facilitator sponsors gas.

- `supabase/` — Postgres schema (migrations) + generated seed (`apps/api/scripts/gen-seed.ts`) for the linked project `tspsaemylnzvdgwtjcrz`. Docs in `docs/supabase/`: env setup, schema/RLS, client usage, CLI workflows. E2E test users seeded: `viajera@nomai.dev` / `duena@nomai.dev`, password `nomai123` (also shown under the login form).

## Commands

- `pnpm install` — install dependencies (pnpm 8, Node >= 18; `apps/agent` needs Node 24)
- `pnpm dev` — api (:3001) + web (:3000); web's `withEve` spawns the eve dev server itself and proxies same-origin `/eve/v1/*`
- `pnpm api:dev` — run only the api (`tsx watch`, port 3001)
- `pnpm api:buy` — run the x402 buyer script
- `pnpm agent:dev` — run the eve agent TUI (`eve dev`, port 2000)
- `pnpm build` / `pnpm lint` / `pnpm type-check` — turbo pipelines
- `pnpm --filter api escrow:deploy [sepolia|mainnet]` / `escrow:admin <cmd>` — deploy/operate the Escrow vault; admin key via `ESCROW_ADMIN_PRIVATE_KEY` at invocation only, `CELO_ATTRIBUTION_TAG` required on every send
- `pnpm --filter api smoke:escrow` — in-process ganache verification of the vault (deposit/admin-transfer/non-admin revert/handover), no funds needed
- `pnpm --filter agent smoke:book [-- --confirm-mainnet]` — Traveler-pays Booking loop smoke (quote → book → 402 → payment-auth → retry); dry-run stops right before the paid retry, `--confirm-mainnet` settles real wARS into the vault — operator only
- `pnpm --filter web test` — Vitest unit tests (`src/**/*.test.ts`)
- `pnpm --filter web test:e2e` — Playwright E2E (`e2e/`); reuses a dev server on :3000 or starts one (`E2E_PORT` overrides)
  - `next build` and `next dev` share `apps/web/.next`: stop the dev server before building, and restart it after `pnpm install` (stale chunks blank every page)
  - Pick HeroUI Select options with `pickOption` (`e2e/helpers.ts`) and wait for each wizard step's heading before the next click; clicks during popover/step transitions get swallowed
  - Dev-mode Next compiles routes serially: `workers: 3` is intentional — more workers starve navigations during cold compile; the API (`:3001`) must be up, Playwright starts it

`apps/api` requires `.env` (see `apps/api/.env.template`): `X402_API_KEY`, `X402_PAY_TO`, `BUYER_PRIVATE_KEY`. Defaults to Celo Sepolia testnet.

## Conventions

- TypeScript everywhere, ESM (`"type": "module"` in api)
- eslint for linting, `tsc --noEmit` for type-checking
- The `@x402/paywall` peer dependency is intentionally unmet — this project is an API seller and never renders the browser paywall (see `pnpm.peerDependencyRules` in `package.json`)

## Business model

Two revenue streams (see `docs/adr/0005`): a fixed-percentage Service fee the
Traveler pays on every Booking (it covers the Agent's cost; Credits / *monedas Nomai*
are retired), and an FX fee on conversions the Agent executes (e.g. wARS→wBRL).
Owners are never charged: no subscription, no commission.

Payments (`docs/adr/0006`): a Booking's rental amount goes into an Escrow contract,
not straight to the Owner. 50% is released to the Owner at the Cancellation
deadline (5 days before check-in), the rest 24 h after check-in if there is no
Claim. Cancellation refunds 100% before the deadline, 50% after; the Service fee
is never refunded. Nomai resolves Claims but can only route funds to that
Booking's Traveler or Owner.

Abuse controls (`docs/adr/0002`): free Agent usage is gated by verification tiers
(phone → first Ripio funding or Self passport proof → government ID at Booking),
with a daily free-tier budget and the agent wallet's balance as hard spend caps.

Domain vocabulary lives in `GLOSSARY.md` — use its terms (Traveler, Owner, Agent,
Booking, Service fee, Escrow, Claim, FX fee) in issues, specs and code comments.

## Agent skills

- When asking the user to pick between options, use the interactive
  multiple-choice question tool instead of numbered plain-text questions.
  This includes grilling / design-tree rounds: send each round through the
  tool (max 4 questions per call — split larger rounds), and mark the
  recommended option in its label or description.

### Issue tracker

Issues and specs live as GitHub issues on `YagLab0/nomai`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.
The issues are the backlog, the single list of pending work. A change is done only
once the issues it touches are current: close each finished one with a comment
naming where it landed, rewrite the scope of each partly done one, and open an
issue for every new gap or bug you found.

### Domain docs

Single-context layout: root `GLOSSARY.md` + `docs/adr/`, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
