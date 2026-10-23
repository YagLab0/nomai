# Traveler views — design spec

Source of truth for the Traveler-facing templates in `apps/web`. Decisions were made
in a grilling session (2026-10-23); domain terms follow `GLOSSARY.md`, money rules
follow `docs/adr/0001`–`0003`. UI copy is Spanish (rioplatense, voseo); code,
routes and identifiers are English.

Everything here is a **template**: no real auth, no LLM, no chain calls. Mock data
lives in `src/lib/mock/` so it can be swapped for real sources later.

## 1. Stack

| Piece | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19 |
| Styling | Tailwind CSS 4 (CSS-first config in `globals.css`, `@theme`) |
| Components | HeroUI v3 (`@heroui/react`, `@heroui/styles`) — read its docs before using; v3 is built on React Aria and differs from v2 (no `HeroUIProvider`/`tailwind` plugin like v2 — follow the v3 install guide) |
| Chat | assistant-ui (`@assistant-ui/react`) with a **local mock runtime** (`useLocalRuntime` + a `ChatModelAdapter` that streams scripted replies). Later swapped for the real Agent backend built with Eve (Vercel). |
| Icons | `lucide-react` |

The old shadcn-style components (`src/components/ui/button.tsx`, `card.tsx`,
`sheet.tsx`) and `class-variance-authority`, `@radix-ui/*`, `tailwindcss-animate`
are removed once nothing imports them. `src/lib/app-utils.ts` (unused template
helpers) is removed.

## 2. Visual identity

Launch region is northern Argentina (Salta, Jujuy, Cafayate, Quebrada de
Humahuaca). The palette is the earth of the Quebrada: terracotta primary, a
verde agua accent, warm paper neutrals.

| Token | Value | Use |
|---|---|---|
| `terra` | `#B4552D` | primary, CTAs, Nomito avatar |
| `terra-deep` | `#8F3F20` | hover/pressed, headings on light |
| `terra-soft` | `#F3E2D6` | tinted surfaces, Nomito bubbles |
| `agua` | `#3E9C93` | accent: success, savings, "confirmado", links in app |
| `agua-soft` | `#DDF0EC` | savings chips, tier "done" |
| `paper` | `#FBF6F0` | page background |
| `sand` | `#EADFD2` | borders, dividers |
| `ink` | `#2A1E17` | text |
| `ink-muted` | `#7A6A5E` | secondary text |

Map these into HeroUI's theme variables (accent → terra, success → agua,
background → paper, foreground → ink, border → sand). Keep existing landing
tokens that are still used, drop the rest. Light mode only; define tokens as CSS
variables so dark mode can be added later.

Type: keep the current sans (`--font-sans`) for UI, add a display face with
character for headings (e.g. `Fraunces` or `DM Serif Display` via `next/font`);
mono for codes/prices in ticket elements.

Motif: the boarding pass / ticket (perforated edge, mono codes like `FLN → SLA`)
survives, used for Booking cards and shortlist results — not everywhere.

### Nomito

Nomito is the Agent's product name and the protagonist of the product.
Avatar: simple isotype — a terracotta circle with a lowercase `n` in the display
face and a small agua dot (like a sun over the hills). One component
`<NomitoAvatar size="sm|md|lg" />`, used in the landing hero, chat header, chat
messages and empty states. Never call it "bot", "asistente" or "Eve" in UI.

## 3. Copy rules

- The Traveler never sees web3: no "wARS", "wFIAT", "x402", "Celo", "ERC-8004",
  "wallet address", "firma". Money is shown in local currency: `$ 120.000 ARS`,
  `R$ 850 BRL`.
- Agent wallet balance is "Tu saldo" / "Saldo de Nomito".
- Credits are "monedas Nomai".
- Use "viajero", "dueño"/"alojamiento", "reserva" (Booking).

## 4. Mock scenario

All scripted conversations use one case: **a Brazilian Traveler (Lucas, from
Florianópolis) books in Salta and Cafayate**, pays in reales; Nomito converts
BRL→ARS and shows the FX fee as its own line:

```
Reserva: Casa de Adobe, Cafayate · 3 noches · $ 285.000 ARS
Conversión BRL → ARS · 1 BRL = 195 ARS
Comisión de conversión Nomai · R$ 14,60
Total · R$ 1.476,15 BRL
```

(numbers are illustrative; keep them internally consistent in the mock.)

## 5. Routes

| Route | Page |
|---|---|
| `/` | Landing (redesign) |
| `/signup` | Crear cuenta |
| `/login` | Ingresar |
| `/app` | Traveler home: chat with Nomito at the center + side panel |

`/app` is the dashboard. There is no separate `/app/chat`.

## 6. Auth pages (UI only)

Shared split layout: left = form card, right (lg+) = terracotta panel with
Nomito avatar and a short line ("Contale tu viaje a Nomito"). Mobile: form only.

**/signup** — two steps on one page (client state):
1. Method: phone input (country select AR/BR/CL/UY/PY/BO, default by locale) +
   "Recibir código por WhatsApp" primary; secondary "Continuar con Google" and
   "Continuar con email".
2. OTP: 6-digit code input, resend timer, then redirect to `/app`.

Below the form, a **verification ladder** (ADR-0002) showing what each step unlocks:
1. Teléfono → primeras monedas Nomai gratis
2. Primera carga de saldo (o prueba de pasaporte Self) → el resto del regalo
3. Documento de identidad → solo al reservar

**/login** — same methods, no ladder; link to `/signup`.

Submitting never calls a backend; simulate latency (~800ms) and go to `/app`.

## 7. /app — Traveler home

Desktop (lg+):

```
┌──────────┬──────────────────────────────────┬───────────────┐
│ nav rail │  Chat con Nomito                 │ Panel         │
│ logo     │  ┌ header: avatar · "Nomito"     │ Monedas Nomai │
│ Inicio   │  │  · cost chip of last search   │  + nivel      │
│ Reservas │  │ messages…                     │ Tu saldo      │
│ Ayuda    │  │ shortlist ticket cards        │  [Cargar]     │
│ avatar   │  │ booking quote card            │ Reservas      │
│          │  └ composer + suggestions        │ Búsquedas     │
└──────────┴──────────────────────────────────┴───────────────┘
```

Mobile: top bar (logo, monedas count, menu); chat full screen; the panel opens
as a HeroUI drawer from a top-bar button; nav in the drawer too.

### Panel widgets (mock data in `src/lib/mock/traveler.ts`)

- **Monedas Nomai**: balance (e.g. 42), progress through the verification ladder
  (step 2 of 3 pending: "Cargá saldo por primera vez y sumá 60 monedas").
- **Tu saldo**: Agent wallet balance in local currency (`R$ 1.920 BRL`), button
  "Cargar" (no-op toast "Pronto vas a poder cargar con Ripio").
- **Reservas**: next Booking as a mini ticket (`FLN → SLA`, dates, alojamiento,
  "Confirmada"); link "Ver todas" (no-op).
- **Búsquedas recientes**: 3 past conversations (title + date + monedas spent);
  clicking one is a no-op for now.

### Chat (assistant-ui)

- Built with assistant-ui primitives (`ThreadPrimitive`, `MessagePrimitive`,
  `ComposerPrimitive`), styled with Tailwind/HeroUI tokens — not the default
  assistant-ui theme.
- Runtime: `useLocalRuntime(mockAdapter)` in `src/lib/nomito/mock-adapter.ts`. The
  adapter streams a scripted reply token by token based on simple keyword
  matching of the last user message, with a sensible default. Keep the adapter
  the only place that knows replies are fake.
- Empty state: Nomito avatar, "¿A dónde querés ir?" and 3 suggestion chips
  ("Una semana en Salta y Cafayate", "Algo tranquilo en Purmamarca", "Hostel en
  Tilcara para 2").
- Rich results: Nomito replies can include a **shortlist** (2–3 ticket cards:
  alojamiento, town, price/noche in ARS and the Traveler's currency, "directo con
  el dueño" badge) and a **booking quote** card (lines from §4, primary
  "Confirmar reserva" → mock success state "Reserva confirmada · pagada directo
  al dueño"). Implement these as assistant-ui tool UIs (`makeAssistantToolUI`)
  so a real backend can later emit the same tool calls.
- Credits: Nomito never asks before spending. Each assistant message that ran a
  search shows a small chip "−3 monedas" after the fact.

## 8. Landing redesign

Full redesign, Traveler first, Owners second. Keep the brand earthy and warm;
less fintech, more travel. Remove crypto jargon from all copy (section
"stack" with wFIAT/x402/Celo/ERC-8004 goes away or becomes one plain-language line
in the footer: "Pagos en moneda local sobre infraestructura abierta").

Sections:

1. **Navbar**: logo · "Cómo funciona" · "Para dueños" · `Ingresar` (ghost) ·
   `Crear cuenta` (primary). Mobile: drawer.
2. **Hero**: left — headline about traveling the Norte with Nomito ("Nomito
   arma tu viaje al Norte. Vos pagás en tu moneda."), subcopy, CTA "Hablar con
   Nomito" → `/signup`, secondary "Cómo funciona". Right — **live animated chat**
   (auto-playing scripted conversation of the §4 scenario, loops, respects
   `prefers-reduced-motion` by showing the final state). Nomito is visually
   dominant here.
3. **Cómo funciona**: 3 steps (Contale tu viaje → Nomito busca y compara → Pagás
   en tu moneda, directo al dueño).
4. **Destinos del Norte**: ticket-style cards for Salta, Cafayate, Purmamarca,
   Tilcara, Humahuaca with sample price/noche in ARS.
5. **Por qué pagás menos**: plain comparison vs tarjeta + dólar tarjeta/IOF
   (from the existing comparison data, rewritten without jargon).
6. **Para dueños**: "Cero comisión. Siempre." + 3 points (cobro al instante en tu
   moneda, importamos tu perfil de Booking/Airbnb, la reserva se confirma sola)
   + CTA "Sumá tu alojamiento" (no-op / mailto for now).
7. **CTA final** with Nomito avatar + footer.

Keep `Reveal` for scroll-in animations if it still fits.

## 9. Implementation stages

Each stage ends green on `pnpm --filter web build`, `pnpm --filter web lint`,
`pnpm --filter web type-check`, and gets its own commit.

1. **Stack migration**: Next 15, React 19, Tailwind 4, HeroUI v3 installed and
   configured; existing landing builds and looks the same.
2. **Theme + Nomito**: tokens (§2), fonts, `NomitoAvatar`, remove old ui
   components when unused.
3. **Auth pages** (§6).
4. **/app** (§7) with assistant-ui mock runtime.
5. **Landing redesign** (§8).

## 10. Lodgings marketplace

A public catalog of Lodgings (alojamientos) from verified Owners, built on the
same theme as the rest of the app.

| Route | Page |
|---|---|
| `/lodgings` | Public explorer: search, kind filters, price currency picker, ticket-style cards |
| `/owners/[slug]` | Owner storefront (profile + that Owner's Lodgings) |
| `/app/lodgings` | Same explorer inside the app shell ("Explorar" in the nav rail and drawer) |
| `/api/fx` | Display FX rates (Ripio when configured, public feed, static table) |

`/alojamientos` and `/propietarios/:slug` redirect permanently to the English routes.

- One catalog: `src/lib/lodgings.ts` holds Owners, Lodgings, FX helpers and
  `quoteFor`. Nomito's mock adapter, the hero chat, the destinations section and
  the explorer all read from it. Norte argentino Lodgings come first.
- Copy rules (§3) apply: prices are local currency; Owner storefronts say
  "Cobra directo, sin comisión, al instante en su moneda" and never show the
  Owner's wallet address (kept in the data model only).
- **"Pedirle a Nomito"** is the hand-off from a Lodging card to the chat.
  Publicly it links to `/signup`. Inside the app it links to
  `/app?ask=<encoded "Quiero reservar <name>, <town>">`; the thread reads the
  param once (`AskFromUrl`), appends it as the Traveler's message, and clears the
  URL. Nomito then answers with the booking quote for that Lodging.
