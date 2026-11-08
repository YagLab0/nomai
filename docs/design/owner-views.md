# Owner views — design spec

Source of truth for the Owner-facing templates in `apps/web`. Decisions were made
in a grilling session (2026-10-23); domain terms follow `GLOSSARY.md`, money,
Escrow and cancellation rules follow `docs/adr/0005`–`0006`. Stack, theme,
photography and copy rules are the same as `traveler-views.md` — this doc only
covers what the Owner side adds.

Everything here started as a **template**; it has since grown a real backend.
With Supabase env configured the panel renders `OwnerDashboard` from the linked
project (business → Lodgings → Bookings over RLS, plus the api for the Escrow
releases, the inbox, the Reviews and the payout state). Without it, the mock
`OwnerCatalogPanel` keeps the same flow on `src/lib/mock/owner.ts` and the
browser catalog.

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
   * back to the Traveler (ADR-0006). */
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

## 3. Page layout: one panel, six sections

One page: a header, a sticky section bar and the blocks it jumps to.

**Header** — "Panel del dueño · {business}", "Hola, {nombre}" and the "Cobros
Ripio" chip: the truncated deposit address, its state (Verificada · Pendiente ·
Fallida · Sin verificar · Sin cargar) and "Verificar" / "Ver", which opens the
payout modal (issue #68).

**Sticky section bar** — `OwnerSectionNav`: Resumen · Calendario · Mensajes ·
Reservas · Reseñas · Alojamientos, in page order. It sticks right below the
sticky `OwnerShell` header — the offset is measured, so it never covers it —
scrolls sideways on a phone, marks the section being read (`aria-current`) and
carries badges: unread messages (terra alert), upcoming + in-progress Bookings
and the Lodging count. A section only enters the bar when it renders (Mensajes
needs threads, Reseñas needs received Reviews, Calendario needs Lodgings). Every
section has `scroll-mt-44`, so a jump lands clear of the header + bar.

**Payout banner** — while money sits in Escrow and the Ripio address is not
verified, a banner above the summary reads "Tenés $X esperando en Escrow. No se
liberan a tu Ripio hasta que verifiques tu cuenta de cobro", with "Verificar
cuenta". The keeper holds every release until then (ADR-0006, issue #68).

**Resumen** (`#resumen`) — four cards:

- "Cobrado en Ripio": what Escrow already sent to the Owner's account
  (`payments` kind='release', status='sent'), plus a line with the amount still
  "En Escrow" — never the Booking totals, which sit in the vault.
- "Próximo cobro": the next Escrow stage — amount, day and how many Bookings,
  from `nextPayout` in `src/lib/owner-bookings.ts` (half the rental at the
  Cancellation deadline, the rest 24 h after check-in, mirroring
  `process_escrow_releases`). It reads "Retenido hasta verificar tu Ripio" while
  the payout is unverified, "Se libera en las próximas horas" once the day
  arrived, and "Nada pendiente" when nothing is owed.
- "Alojamientos y Noches": published Lodgings and occupied nights.
- "Próxima llegada": the soonest confirmed Booking whose check-in has not
  passed — Traveler, date, Lodging and guests.

**Calendario** (`#calendario`) — the consolidated month grid (§7).

**Mensajes** (`#mensajes`) — one row per Booking thread (ADR-0009): Traveler ·
Lodging, last message, stamp and unread badge; opens that Booking's chat.

**Reservas** (`#reservas`) — one `tablist` with Próximas · En curso · Pasadas ·
Canceladas and each tab's count, five cards per page and a "11–15 de 23" footer
with Anterior / page numbers / Siguiente. It opens on the first tab with
something in it, so a fresh panel lands on the next arrivals; switching tabs
returns to page 1. Each card is a ticket: Traveler name, "identidad
verificada", the Traveler's score, Lodging · town, dates · nights · guests,
amount, status chip (Confirmada = agua; En curso = terra-soft; Pago pendiente /
Reclamo abierto = amber; Completada = muted), "Pago en garantía" while the
rental sits in Escrow (Confirmada / En curso), "Calificá al viajero" once
completed (ADR-0008) and "Mensajes" with its unread badge. Cancelada and
Reembolsada also strike the amount through.

**Reseñas** (`#resenas`) — the Owner's review feed when there are received
Reviews (ADR-0008).

**Alojamientos** (`#alojamientos`) — a card per Lodging (cover photo or
`LodgingArt`, name, kind, town, rating or a "Nuevo" chip when it has no
reviews, price/night, status), linking to its public detail page `/lodgings/[id]`
(traveler-views §16). Each card has "Pausar"/"Publicar", "Editar", "Ver en el
catálogo" and "Escaparate". The section header has "+ Sumar otro alojamiento";
"Editar" opens the same wizard (§9). An edited price applies only to future
Bookings; settled ones are never touched.

## 4. Cancellation

Per ADR-0006 (which supersedes ADR-0004): only the Traveler cancels; the Owner
just sees the outcome. The refund is a single global rule — full until the
Cancellation deadline (5 days before check-in), 50% on or after it — paid back
out of Escrow, where the rental sits until its release stages. The Service fee
is never refunded. The dashboard renders the result ("Cancelada", the amount
struck through); the refund's mechanics belong to the API's `cancel_booking`.

## 5. Copy rules

Same as §3 of traveler-views, plus the Owner-side allowances from §14:

- Amounts only in the Owner's fiat (ARS for Ramón). The Traveler's currency and
  the FX conversion never appear here.
- "Ripio" is allowed; still no wallet addresses, chains or crypto vocabulary.
- "reserva", "viajero", "alojamiento", "escaparate"; voseo rioplatense.

## 6. Entry points

- `NavList` gains **"Mis alojamientos"** → `/app/owner` (desktop rail and the
  mobile menu); it marks itself active like the rest of the items.
- `UserChip` in the Traveler nav gains a "Modo dueño" toggle → `/app/owner`; the
  OwnerShell chip carries the reverse ("Modo viajero" → `/app`). Both render the
  same pill.
- `/owners/join` step "Listo" adds "Ir a tu panel" → `/app/owner`; the existing
  sample-storefront link stays.

## 7. Calendar, and what the dashboard does NOT have

The consolidated calendar (`OwnerCalendar`) is the Calendario section: one row
per Lodging, one column per night of the month, with month navigation and a
"Hoy" shortcut back. Bookings are bars across their nights, labelled with the
Traveler's name and coloured by moment — Próxima (terra), En curso (terra-deep),
Pasada (sand), Sin pagar (dashed amber). Bars are clipped to the month when a
stay crosses an edge (`bookingBarSpan`, `src/lib/owner-calendar.ts`), so a
Booking checking out on the 1st ends exactly at the month's edge. Blocked nights
are striped (`blocked-stripes` in `globals.css`), past nights are muted and
today carries a marker on its column.

"Editar disponibilidad" on a Lodging row opens that Lodging's
`OwnerNightsCalendar` in a modal: open, blocked and booked nights, click (shift
for a range) and "Bloquear"/"Desbloquear". A **blocked night** (GLOSSARY) stops
being offered by `/listings/:slug` and its quote; a **booked** night is struck
through and can never be blocked or unblocked. It reads
`GET /api/owners/lodgings/:id/nights` and writes through the thin web proxies to
`apps/api`, which runs the service_role-only `block_nights` / `unblock_nights`
RPCs — the browser never writes `availability_nights`. Closing the modal
refreshes the consolidated grid.

What the panel deliberately does NOT have:

- Owner-side Agent or chat (ADR-0001: none for now).
- Views/conversion stats — no tracking exists to back them.
- Drafts: a new Lodging is published the moment the wizard finishes. A
  published Lodging can be **paused** from its card (`Lodging.status`:
  published ↔ paused, via `PATCH /api/owners/lodgings/:slug/status` →
  `set_lodging_status`, which re-checks ownership server-side); a paused Lodging
  leaves the public catalog and cannot be booked.
- Owner-initiated cancellation (ADR-0006).
- Owner-side refunds or Claim resolution — Nomai routes those funds (ADR-0006).

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

"+ Sumar otro alojamiento" and "Editar" open one HeroUI modal with four steps,
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

Still out of scope: geocoding or address autocomplete; drafts; booking without
the Agent; importing from Booking/Airbnb in the panel (it stays in
`/owners/join`); changes to the join flow; Lodgings outside the Owner's country
or in another currency; backfill beyond Ramón's two Lodgings; hiding the
address until Booking.

The rest of that original list has since shipped and is documented above: the
real backend and auth (§3 — Supabase + `apps/api`), photo uploads (Storage),
pausing (`Lodging.status`, §7), Owner date blocking (the consolidated
calendar's modal, §7) and reviews (ADR-0008).
