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

**Tus alojamientos** — a card per Lodging (cover photo or `LodgingArt`, name,
kind, town, rating or a "Nuevo" chip when it has no reviews, price/night),
linking to its public detail page `/lodgings/[id]` (traveler-views §16). The
section header has **"Agregar alojamiento"**; each card has **"Editar"**. Both
open the same wizard (§9). An edited price applies only to future Bookings;
settled ones are never touched.

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
- Blocking dates. The Traveler-facing calendar (traveler-views §16) shows
  only nights taken by Bookings; the Owner can't mark nights unavailable.
- Pausing a publication or drafts (no `Lodging.status` field): a new Lodging
  is published the moment the wizard finishes.
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

Lodging creation (§9, issue #21) adds, each with its own commit:

6. **Test infrastructure**: Vitest with a `test` script in `apps/web`, and
   Playwright for end-to-end.
7. **Catalog module**: the store from §9 behind its public interface, tested
   test-first through that interface (create, update, remove, rules,
   validation, `occupiedNights`, persistence). Every surface that reads
   `LODGINGS` switches to it.
8. **Model + backfill**: optional `address`, `lat`, `lng`, `photos` on
   `Lodging`; Ramón's two Lodgings get them; the "Nuevo" chip.
9. **Wizard**: the four-step modal for create and edit, replacing the edit
   modal, including the location lock and delete.
10. **Map and photos**: Leaflet step and photo compression.
11. **Detail page**: traveler-views §16, with cards linking to it.
12. **End-to-end**: the Playwright journeys from §9.

## 9. Lodging creation and editing

Decided in a grilling session (2026-10-24); published as issue #21.

### Domain rules

- A Lodging is priced in its Owner's currency and located in the Owner's
  country (GLOSSARY: Lodging). The wizard's town list holds only the Owner's
  country. Currency, country code, region and the three-letter `code` are
  derived from the town, never typed.
- A Lodging with an upcoming Booking (Confirmada or En curso) can't be
  removed or relocated. Cancelada and Completada Bookings don't count. Both
  of Ramón's seeded Lodgings have upcoming Bookings, so in the demo only
  newly created Lodgings can be deleted.
- A new Lodging is published immediately and starts with no reviews; any
  card that would show its rating shows a "Nuevo" chip instead.
- The exact address and pin are public to every Traveler. That is a
  deliberate choice: nothing is hidden until Booking.

### The wizard

"Agregar alojamiento" and "Editar" open one HeroUI modal with four steps,
"Atrás" / "Siguiente" and a step indicator. "Siguiente" validates only the
current step; going back keeps what was typed. Focus moves to each new step.
Required fields are marked \*.

1. **Básico**: name\*, kind, capacity\*, bedrooms, baths (steppers like the
   join's capacity control).
2. **Ubicación**: town\* (Owner's country only), street address\* (free
   text, not geocoded) and a pin\* on a Leaflet map with OpenStreetMap tiles.
   Choosing a town centers the map on that town's coordinates; the Owner drags
   the pin to the door. Keyboard users can move the pin with the arrow keys or
   reset it to the town center. OSM attribution is shown.
3. **Detalles**: blurb and amenities (add/remove chips).
4. **Fotos y precio**: up to 5 photos, optional; the first is the cover and
   each one can be removed. Price/night\* in the Owner's fiat ("$" for Ramón).

"Publicar" on step 4 saves and toasts "Alojamiento publicado". In edit mode
the button reads "Guardar cambios" and toasts "Alojamiento actualizado".

**Edit mode** opens the same steps prefilled. With upcoming Bookings, the
Ubicación step is read-only with the note "Tenés reservas confirmadas en este
alojamiento: la ubicación no se puede cambiar." The edit modal also holds
"Eliminar alojamiento", behind a confirm. It is disabled, with the reason
shown, while upcoming Bookings exist.

### Photos

Photos are picked locally, resized to about 800 px on the longest side,
re-encoded as JPEG and stored as data URLs with the Lodging, so they survive a
reload within `localStorage`'s ~5 MB budget. If the quota is exceeded the save
fails with a clear message instead of dropping photos silently. Without photos
the card falls back to `LodgingArt`. There is no server upload.

### The catalog: one store for every surface

Today every surface reads the static `LODGINGS` array and its helpers. They
switch to a catalog module that merges that seed with Owner-created
Lodgings plus edits and deletions of seeded ones (stored as overrides and
tombstones; the seed itself is never mutated), persisted in `localStorage`.

- **Reads**: all Lodgings, by id, by Owner, by town.
- **Writes**: create (derives id, currency, country, region, code, zero
  reviews), update, remove. Writes validate required fields, price > 0,
  capacity ≥ 1, at most 5 photos and the Owner's country, and enforce the
  remove/relocate rule. A rejected write leaves the catalog unchanged.
- **Rules and availability**: `canRemove`, `canRelocate` and
  `occupiedNights` (nights covered by Confirmada/En curso Bookings).
- **Subscription**: client surfaces re-render when the catalog changes.

Readers: the Owner panel, the `/lodgings` explorer, Owner storefronts (still
statically generated for the seed, merging created Lodgings after hydration),
Nomito's mock adapter (so it can shortlist a new Lodging by town) and the
detail page.

`Lodging` gains optional `address`, `lat`, `lng` and `photos` (ordered; first
is the cover). They are optional because only Ramón's two Lodgings are
backfilled; the other mock Lodgings keep town-only display.

`localStorage` is per browser: a Lodging created in one browser doesn't exist
in another. That is expected for a template, not a bug.

### Testing

The catalog module is the one seam, tested test-first with Vitest through its
public interface and an in-memory storage stand-in. Tests assert behaviour
(what it returns, what it rejects), never storage keys or internal shape.
Playwright covers a few end-to-end journeys:

- create a Lodging through all four steps; it shows in the panel, survives a
  reload, and appears in `/lodgings`, on the storefront and on its detail page
  with address and map;
- edit a Lodging with upcoming Bookings: location locked, delete disabled;
- delete a newly created Lodging: gone from every surface;
- on a detail page, a range crossing occupied nights is blocked, and
  "Reservar con Nomito" lands in the chat with the Lodging and dates.

No component-level tests of the wizard.

### Out of scope

Real backend, auth or uploads; geocoding or address autocomplete; drafts and
pausing; Owner date blocking; booking without the Agent; importing from
Booking/Airbnb in the panel (it stays in `/owners/join`); changes to the join
flow; Lodgings outside the Owner's country or in another currency; reviews;
backfill beyond Ramón's two Lodgings; hiding the address until Booking.
