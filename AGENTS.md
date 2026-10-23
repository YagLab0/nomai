# nomai

Software for tourism businesses using agents & blockchain. A Celo/x402 application in a pnpm + Turborepo monorepo.

## Structure

- `apps/web` — Next.js 15 (App Router), React 19, Tailwind CSS 4, HeroUI v3; the Agent chat uses assistant-ui on a mock runtime (`src/lib/nomito/mock-adapter.ts`). Design spec: `docs/design/traveler-views.md`. Lodgings marketplace: `/lodgings`, `/owners/[slug]`, `/app/lodgings` (§10); Owner onboarding: `/owners/join` (§14). Photos live in `public/images` (credits in `CREDITS.md`).
- `apps/api` — Hono server implementing both halves of an x402 payment: a seller that answers `402 Payment Required` (`GET /free` open, `POST /paid` charges USDC on Celo) and a buyer that pays it (`src/buyer.ts`)

`X402_SETUP.md` explains the payment flow and facilitator setup. The buyer needs no CELO — the facilitator sponsors gas.

## Commands

- `pnpm install` — install dependencies (pnpm 8, Node >= 18)
- `pnpm dev` — run all apps via turbo
- `pnpm api:dev` — run only the api (`tsx watch`, port 3001)
- `pnpm api:buy` — run the x402 buyer script
- `pnpm build` / `pnpm lint` / `pnpm type-check` — turbo pipelines

`apps/api` requires `.env` (see `apps/api/.env.template`): `X402_API_KEY`, `X402_PAY_TO`, `BUYER_PRIVATE_KEY`. Defaults to Celo Sepolia testnet.

## Conventions

- TypeScript everywhere, ESM (`"type": "module"` in api)
- eslint for linting, `tsc --noEmit` for type-checking
- The `@x402/paywall` peer dependency is intentionally unmet — this project is an API seller and never renders the browser paywall (see `pnpm.peerDependencyRules` in `package.json`)

## Business model

Two revenue streams (see `docs/adr/0001`): Credits (*monedas Nomai*) the Traveler
buys for Agent research, and an FX fee on conversions the Agent executes
(e.g. wARS→wBRL). Owners are never charged — a Booking's x402 `payTo` is the
Owner's own wallet; the platform never holds booking funds.

Abuse controls (`docs/adr/0002`): free credits release in verification tiers
(phone → first Ripio funding or Self passport proof → government ID at Booking),
with a daily free-tier budget and the agent wallet's balance as hard spend caps.

Domain vocabulary lives in `GLOSSARY.md` — use its terms (Traveler, Owner, Agent,
Booking, Credit, FX fee) in issues, specs and code comments.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `YagLab0/nomai`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` + `docs/adr/`, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
