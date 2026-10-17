# nomai

Software for tourism businesses using agents & blockchain. A Celo/x402 application in a pnpm + Turborepo monorepo.

## Structure

- `apps/web` — Next.js 14 (App Router), Tailwind CSS, shadcn/ui-style components (Radix + CVA)
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

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `YagLab0/nomai`; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` + `docs/adr/`, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.
