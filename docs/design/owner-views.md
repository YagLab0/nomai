# Owner views — design spec

Source of truth for the Owner-facing templates in `apps/web`. Decisions were made
in a grilling session (2026-10-23); domain terms follow `GLOSSARY.md`, money and
cancellation rules follow `docs/adr/0001`–`0004`. Stack, theme, photography and
copy rules are the same as `traveler-views.md` — this doc only covers what the
Owner side adds.

Everything here is a **template**: no real auth, no backend, no chain calls. Mock
data lives in `src/lib/mock/owner.ts`.

## 1. Routes and shells

| Route | Page |
|---|---|
| `/app/owner` | Owner dashboard ("Panel") |
| `/app/dueno` | permanent redirect → `/app/owner` (in `next.config`, like §10 of traveler-views). ASCII only: Next's routing doesn't match a literal `/app/dueño` segment |

`src/app/app/` splits into route groups:

- `app/(traveler)/` keeps `AppShell` (nav rail, Nomito runtime, side panel):
  today's `app/layout.tsx`, `app/page.tsx` and `app/lodgings/` move inside it.
  URLs don't change.
- `app/(owner)/owner/` gets `OwnerShell`: a slim chrome with logo and a
  user chip showing the Owner with a mode toggle ("Modo viajero" →
  `/app`). One account is both Traveler and Owner (§14 of traveler-views);
  the toggle is how the template switches personas. No
  `AssistantRuntimeProvider`, no chat, no monedas/saldo widgets — ADR-0001
  has no Owner-side Agent. No nav links in the chrome — the public surface
  is reached from each Alojamiento card ("Ver en el catálogo").

## 2. Persona and mock data

The logged-in Owner is **Ramón Guaymás** (`ramon-guaymas` in `OWNERS`):
Cafayate, verified, two Lodgings — Casa de Adobe and Cabaña Viñas del Sol. The
Booking Lucas confirms in the §4 scenario appears here as a confirmed Booking:
what the Traveler pays in the chat lands in the Owner's panel as money received.

`src/lib/mock/owner.ts` holds the Owner's view of a Booking:

```ts
export interface OwnerBooking {
  id: string;
  traveler: { name: string; origin: string; verified: boolean };
  lodgingId: string;
  checkIn: string; // ISO dates
  checkOut: string;
  nights: number;
  /** Settled to the Owner's Ripio account, in the Owner's own fiat. */
  amount: number;
  status: 'confirmada' | 'en-curso' | 'completada' | 'cancelada';
  /** Set only when status is 'cancelada': when it was canceled and what went
   * back to the Traveler (ADR-0004). */
  canceledAt?: string;
  refunded?: number;
  isNew?: boolean;
}
```

Statuses are derived from dates in real life (payment *is* confirmation — there
is no "pending payment"), but the mock pins them. Mock "today" is early November
2026, consistent with `mock/traveler.ts`. `verified` is always true: ADR-0002
requires government ID at Booking time, so every Traveler who has a Booking has
a verified document.

Mock Bookings for Ramón (keep the numbers internally consistent — price/night ×
nights = amount):

- Lucas · Florianópolis, Brasil · Casa de Adobe · 20→23 nov · 3 noches ·
  $285.000 · confirmada · `isNew` — the §4 Booking; dated after his Salta stay
  (`mock/traveler.ts` has him at Posada El Algarrobo 12→19 nov).
- Martina · Montevideo · Cabaña Viñas del Sol · 3→7 nov · 4 noches · $480.000 ·
  en curso.
- Sofía · Buenos Aires · Casa de Adobe · 12→15 oct · 3 noches · $285.000 ·
  completada.
- Diego · Córdoba · Cabaña Viñas del Sol · 18→22 sep · 4 noches · $480.000 ·
  completada.
- Camila · Santiago de Chile · Casa de Adobe · 8→11 nov · $285.000 ·
  cancelada el 4 nov (dentro de la ventana) · refunded $142.500 (50%).

## 3. Page layout: Resumen → Reservas → Tus alojamientos

One page, three stacked blocks.

**Resumen** — the pitch in one line:

- "Este mes cobraste $622.500" — money in minus money out in November
  ($285.000 + $480.000 − $142.500).
- "Próxima llegada: Lucas · Casa de Adobe · 20 nov".

**Reservas** — one ticket-style card per Booking: Traveler name, origin, badge
"documento verificado", lodging, dates and nights, amount (`$285.000`), status
chip (Confirmada = agua; En curso / Completada neutral; Cancelada muted). A
`isNew` Booking gets a "Reserva nueva" chip. A cancelada shows an extra line:
"Se devolvieron $142.500 al viajero". Each card has "Contactar al viajero" →
no-op toast, same convention as dead buttons elsewhere.

**Tus alojamientos** — a card per Lodging (photo or `LodgingArt`, name, kind,
town, rating, price/night), linking to the public card in `/lodgings`. "Editar"
opens a HeroUI **modal** with four fields: name, blurb, amenities and
price/night. "Guardar" updates client state and toasts "Alojamiento actualizado"
— same mock-mutation convention as "Confirmar reserva". An edited price applies
only to future Bookings; settled ones are never touched.

## 4. Cancellation

Per ADR-0004: only the Traveler cancels; the Owner just sees the outcome.
Refund is a single global rule — full until 7 days before check-in, 50% inside
that window — paid back out of the Owner's wallet, which already holds the
payment. The dashboard renders the result ("Cancelada · se devolvieron $X"); the
refund's mechanics are out of scope for the template.

## 5. Copy rules

Same as §3 of traveler-views, plus the Owner-side allowances from §14:

- Amounts only in the Owner's fiat (ARS for Ramón). The Traveler's currency and
  the FX conversion never appear here.
- "Ripio" is allowed; still no wallet addresses, chains or crypto vocabulary.
- "reserva", "viajero", "alojamiento", "escaparate"; voseo rioplatense.

## 6. Entry points

- `UserChip` in the Traveler nav gains a "Modo dueño" toggle → `/app/owner`; the
  OwnerShell chip carries the reverse ("Modo viajero" → `/app`).
- `/owners/join` step "Listo" adds "Ir a tu panel" → `/app/owner`; the existing
  sample-storefront link stays.

## 7. What the dashboard does NOT have

- Owner-side Agent or chat (ADR-0001: none for now).
- Views/conversion stats — no tracking exists to back them.
- Blocking dates / availability calendar.
- Pausing a publication (no `Lodging.status` field).
- Owner-initiated cancellation (ADR-0004).
- Any real backend — all mock, like the rest of the app.

## 8. Implementation stages

Each stage ends green on `pnpm --filter web build`, `pnpm --filter web lint`,
`pnpm --filter web type-check`, and gets its own commit.

1. **Route groups + OwnerShell**: `(traveler)`/`(owner)` split, `/app/dueño`
   redirect, `/app/owner` renders the shell with an empty main.
2. **Mock + Resumen**: `src/lib/mock/owner.ts` with `OwnerBooking` and the five
   Bookings; the Resumen block.
3. **Reservas**: the cards with statuses, cancellation line, "Reserva nueva"
   and "Contactar" no-ops.
4. **Tus alojamientos**: cards + edit modal (name, blurb, amenities, price).
5. **Entry points**: UserChip mode toggle and the `/owners/join` link.
