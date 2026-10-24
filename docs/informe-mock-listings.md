# Informe: mock de publicaciones + búsqueda para el Agent

Propuesta para darle al Agent un inventario consultable (buscar, cotizar, reservar)
sobre el modelo de datos de `modelo-datos-publicaciones.pdf`, hoy con un array
mockeado en `apps/api` y después con Supabase. Octubre 2026 — borrador.

---

## 1. Lo que trae el modelo de datos

El PDF define el dominio de publicaciones de hospedaje:

| Entidad | Rol | Lo relevante para el Agent |
|---|---|---|
| `business` | Operador dueño de hospedajes | `payout_address` = el `payTo` x402 — la plata cae directo al Owner |
| `property` | Inmueble físico | `city`, `country_code`, lat/lng, `timezone` (define la "noche"), `property_type` enum |
| `listing` | La publicación vendible | `slug` único (id público para agentes), `kind` (entire_place/room), `max_guests`, `base_price_minor`, `currency`, `min_nights`, `instant_book`, bools de reglas de casa, `status` |
| `amenity` + `listing_amenity` | Catálogo canónico N:M | filtros de búsqueda (`wifi`, `pool`...) con `detail` opcional |
| `rate_rule` | Precio por temporada | rango de fechas + `nightly_price_minor` + `priority` |
| `availability_night` | Disponibilidad por noche | PK `(listing_id, night)`, `status` open/blocked/booked, `units_available`, `price_minor` override |
| `cancellation_policy` | Reutilizable por operador/global | `cancel_policy_id` en listing |
| `booking`/`payment` | **contexto futuro** | `payment` ya tiene la forma del receipt x402 (payer, pay_to, amount_minor, asset, network, tx_hash) |

Decisiones del modelo que el mock y la API tienen que respetar:

- **Dinero en minor units (bigint)** — `base_price_minor`, nunca flotantes.
- **Solo `published`** es visible para agentes.
- **`slug` es el identificador público** — el agente referencia publicaciones por slug, no por uuid.
- **Enums cerrados** en vez de texto libre — las tools devuelven esos valores tal cual.
- Disponibilidad **por noche** en timezone de la propiedad.
- `payout_address` vive en `business`, no en listing.

Nota: el PDF asume `X402_PRICE` en unidades raw ("igual que el API"), pero el env var
ahora es en unidades enteras. No hay conflicto real: el endpoint de booking calcula
su precio desde `availability_night`/`rate_rule` (raw units) — el env var solo aplica
al `/paid` genérico de Credits.

## 2. Arquitectura propuesta

```
Agent (eve)                    apps/api                      futuro
──────────                     ────────                      ──────
tools/                                                         
  search_listings ──HTTP──►  GET /listings/search      ─►  misma ruta,
  quote_booking    ──HTTP──►  GET /listings/:slug/quote     respuesta
  book_listing     ──HTTP──►  POST /listings/:slug/book     idéntica vía
       │                          (x402, precio dinámico,      Supabase
       └── pay_endpoint ─────►  payTo = payout_address)
                                  ┌──────────────────┐
                                  │  src/data/mock.ts │ ← array mockeado
                                  │  (→ supabase.ts)  │ ← swap de datasource
                                  └──────────────────┘
```

**El seam es HTTP.** El agente nunca importa el modelo de datos ni la base — solo
consume endpoints. El día que `apps/api` cambie el mock por Supabase, ni una tool
ni una instrucción del agente se toca. Por eso el mock va en `api` y no en `agent`:
`api` es la frontera de datos (hoy mock, mañana Supabase, pasado channel managers).

Bonus: el endpoint de booking **es el "endpoint del Owner" del demo** — `payTo` sale
de `business.payout_address` de cada publicación, así distintos Owners reciben en
wallets distintas sin configuración extra.

## 3. El mock

Archivo `apps/api/src/data/mock.ts` (o `mock/` si crece):

- **Tipos TS** espejo del PDF: `Business`, `Property`, `Listing`, `Amenity`,
  `AvailabilityNight`, `RateRule`, `CancellationPolicy`. Mismos nombres de campo
  que el schema — la migración es copiar rows.
- **Volumen sugerido**: ~6 businesses (wallets de prueba en `payout_address`),
  ~8 properties, ~14 listings, catálogo de ~20 amenities, 3-4 cancellation policies.
  Ciudades LATAM variadas (Buenos Aires, Florianópolis, Bogotá, Medellín, Bariloche…)
  para que las búsquedas den resultados interesantes.
- **Availability**: en vez de 14 × 90 filas escritas a mano, un **generador
  determinista** (seed por listing) que materializa `availability_night` para los
  próximos ~90 días con algo de ruido (noches blocked/booked, un par de rate_rules
  de temporada alta). Mismo seed → mismos datos → demos reproducibles.
- **Monedas**: mayoría `USD` (liquida USDC), pero **al menos 1-2 listings con
  `currency: 'BRL'`** para que el endpoint ofrezca `wbrl` en el accepts — ahí se
  ve el corredor andando (agente paga wARS→swap→wBRL). El PDF deja multi-moneda
  como pregunta abierta; el mock la hace visible sin decidirla.

## 4. Endpoints del api

Rutas públicas (sin pago) para research — el gasto del Traveler es en Credits, no por query:

| Ruta | Qué hace |
|---|---|
| `GET /listings/search?city=&country=&checkin=&checkout=&guests=&type=&amenities=&max_price_minor=` | Cards: slug, title, summary, foto cover, ciudad, precio/noche, y `total_minor` calculado para la estadía si hay fechas. Solo `status=published` con todas las noches `open`. |
| `GET /listings/:slug` | Detalle completo: amenities, fotos, política de cancelación, reglas de casa. |
| `GET /listings/:slug/quote?checkin=&checkout=&guests=` | Desglose noche a noche (base vs rate_rule vs override), fees, `total_minor`, y assets aceptados para pagar. 409 si no cumple `min_nights`/`max_guests` o hay noches no-open. |

Ruta paga (x402) — la que ejecuta el Booking:

| Ruta | Qué hace |
|---|---|
| `POST /listings/:slug/book` | Body `{checkin, checkout, guests, guest_ref}`. El middleware recalcula la cotización por request — `price` y `payTo` son **funciones dinámicas** del SDK (verificado en `@x402/core` 2.28), o sea cobra el `total_minor` real a `business.payout_address`. Después de settle: marca noches `booked`, devuelve `{booking_id, tx_hash}`. La extensión `payment-identifier` del facilitador permite adjuntar el booking_id al pago para reconciliar el ledger. |

`POST /paid` actual queda como el endpoint genérico de venta de Credits.

## 5. Tools del agente

Tres tools finas — toda la lógica vive en el api:

| Tool | Hace | Consume |
|---|---|---|
| `search_listings` | Buscar hospedajes por ciudad/fechas/huéspedes/filtros | `GET /listings/search` |
| `quote_booking` | Cotizar una estadía concreta (desglose por noche + total) | `GET /listings/:slug/quote` |
| `book_listing` | Ejecutar el Booking: confirmar y pagar | `pay_endpoint` → `POST /listings/:slug/book` |

- `book_listing` llama internamente a la lógica de `pay_endpoint` (o la reusa como
  está). Antes de pagar, la instrucción del agente exige: quote fresca + Traveler
  confirmó + balance suficiente (`check_balance`).
- Env nueva en el agente: `NOMAI_API_URL` (default `http://localhost:3001`).
- `check_balance` queda para el hard spend cap; `pay_endpoint` se mantiene como
  tool de bajo nivel.
- Resultado del booking: `{booking_id, tx_hash, explorer_url}` — el agente se lo
  muestra al Traveler como comprobante.

## 6. Camino a Supabase

El mock ya está diseñado para ser migración directa:

1. **Schema**: el PDF tal cual — Postgres enums (`property_type`, `listing_status`…),
   `uuid` PKs, `citext` para slug, `bigint` para precios, PK compuesta en
   `availability_night` y `listing_amenity`. `lat/lng numeric` ahora; PostGIS si la
   búsqueda por cercanía se vuelve núcleo.
2. **Datasource swap**: `src/data/mock.ts` implementa una interfaz tipo repositorio
   (`searchListings`, `getBySlug`, `quoteStay`, `bookStay`); `src/data/supabase.ts`
   implementa la misma con `supabase-js`. Un env var elige el backend.
   → `@supabase/supabase-js` como dep del api.
3. **Search**: primero filtros SQL + join a `availability_night`; después una
   función RPC `search_listings(...)` con la misma firma cuando haga falta
   (búsqueda de texto con `pg_trgm`, geo con PostGIS).
4. **Seed**: una migración/seed que inserta EL MISMO mock → paridad demo/prod.
5. **RLS**: después, para el panel del Owner (fuera de scope del agente).
6. Skills del repo: `supabase` y `supabase-postgres-best-practices` aplican acá
   cuando toque escribir schema/queries.

## 7. Orden de trabajo sugerido

1. `src/data/mock.ts` — tipos + datos + generador de availability.
2. Endpoints públicos (`search`, `:slug`, `quote`).
3. Tools del agente (`search_listings`, `quote_booking`) + `NOMAI_API_URL`.
4. Endpoint pago `POST /listings/:slug/book` (precio/payTo dinámicos + payment-identifier).
5. `book_listing` tool + instrucciones actualizadas (quote → confirm → pay).
6. E2E: agente busca → cotiza → Traveler confirma → paga → Owner recibe wBRL/USDC.
7. Supabase: schema + seed + `supabase.ts` datasource.

Con 1–4 el agente ya "tiene inventario"; con 5–6 la demo cierra el loop completo
del corredor (wARS → swap → wBRL → wallet del Owner).
