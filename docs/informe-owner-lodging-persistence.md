# Informe: alta de Lodgings persistente en Supabase (Owner wizard)

El wizard del Owner dejaba todo en `localStorage` (`lib/catalog.ts`). Ahora
crea, edita y archiva Lodgings en Postgres en una sola transacción, con fotos
en Supabase Storage y reglas de Upcoming Booking calculadas desde `bookings`
real. El catálogo del navegador queda solo como fallback sin Supabase (mock
mode, espejo de `LISTINGS_DATA_SOURCE=mock`).

## Archivos tocados

- `supabase/migrations/20261027130000_owner_lodging_writes.sql` — **nueva**,
  aditiva (timestamp > 20261027120000; se renombró desde 20261026120000 porque `main` trajo `20261026120000_agent_usage_currencies.sql` con la misma versión). **No aplicada** a la base remota.
- `apps/web/src/app/api/owners/lodgings/shared.ts` — **nuevo**: validación del
  draft (mismas reglas que `catalog.ts`), mapa kind→`property_type`, moneda y
  timezone por país (espejo server-side de `ownerFiat`), subida de fotos a
  Storage con compensación, mapeo de códigos de error RPC → HTTP.
- `apps/web/src/app/api/owners/lodgings/route.ts` — **nuevo**: `GET` lista los
  Lodgings del Owner autenticado (negocio resuelto por `businesses.user_id =
  auth.uid()`) con `canRelocate`/`canRemove` por Lodging; `POST` publica.
- `apps/web/src/app/api/owners/lodgings/[id]/route.ts` — **nuevo**: `PATCH`
  edita (id o slug), `DELETE` archiva. Limpia en Storage las fotos reemplazadas
  tras un update exitoso.
- `apps/web/src/components/owners/lodging-wizard.tsx` — en modo Supabase llama
  a los endpoints (POST/PATCH/DELETE) con estados de carga y errores visibles;
  recibe `rules` (veredicto del servidor) y `onSaved`. En mock mode sigue con
  `catalog.*` sin cambios.
- `apps/web/src/components/owners/owner-dashboard.tsx` — la lista de Lodgings
  ahora sale de `GET /api/owners/lodgings` (fotos, dirección, pin, amenities,
  reglas incluidas); "Sumar otro alojamiento", "Cargar alojamiento" y el lápiz
  de cada card abren el wizard; el update ad-hoc de `listings` que hacía
  `saveAlojamiento` se eliminó (todo pasa por el wizard). Pause/resume sigue
  igual vía RLS, ahora por slug.
- `apps/web/src/lib/supabase/database.types.ts` y `apps/api/src/database.types.ts`
  — signatures de `ensure_amenity`, `create_lodging`, `update_lodging`,
  `archive_lodging` (las dos copias quedaron idénticas).

`lib/catalog.ts`, `lib/lodgings.ts`, `LODGINGS` y `owner-catalog-panel.tsx`
sin tocar: el marketplace público y el panel mock los siguen usando.

## Migración nueva (NO aplicada)

`20261027130000_owner_lodging_writes.sql`:

1. **Storage** — bucket `listing-photos` público (solo lectura por policy).
   Las escrituras van únicamente por el server con la secret key, igual que
   el resto de las tablas satélite.
2. **`ensure_amenity(label)`** — texto libre → `amenities.id`: por `code`
   slugificado, luego por `name` case-insensitive, y si no existe crea la fila
   en categoría `servicios` (precedente del seed). Nada que el Owner tipee se
   pierde; `listing_amenities.detail` guarda la redacción original cuando no
   es el nombre canónico. EXECUTE revocado: solo la llaman las otras RPC.
3. **`create_lodging(p_user_id, ...)`** — `security definer`: resuelve el negocio por
   `businesses.user_id = p_user_id`, valida la moneda contra `currencies`, valida y en una transacción inserta `properties` +
   `listings` (`status='published'`, `published_at=now()`) + `listing_photos`
   (position = orden del wizard, `is_cover` = la primera) +
   `listing_amenities` + `availability_nights` `open` para los próximos 365
   días (`on conflict do nothing`). IDs `lst_*`/`prp_*`/slug con sufijo random.
4. **`update_lodging(...)`** — busca por id o slug, verifica `owns_listing`,
   recalcula Upcoming Bookings en `bookings` y bloquea el cambio de
   ciudad/dirección/pin/país si los hay (HTTP 409). Reemplaza fotos y
   amenities completos; repone noches faltantes en la ventana sin tocar las
   `booked`/`blocked`; actualiza `currency` si la relocalización cambia de
   país.
5. **`archive_lodging(id)`** — soft delete (`status='archived'`), rechaza con
   Upcoming Booking. Los bookings históricos conservan su FK.

Grants: las tres RPC de escritura son **solo `service_role`**, igual que el
resto de las RPC del repo (`book_stay`, `cancel_booking`, escrow). La ruta web
verifica la sesión con `auth.getUser()` y las llama con el cliente admin
pasando `p_user_id`; la ownership se re-verifica dentro de cada función
contra `businesses.user_id`. `update_lodging` y `archive_lodging` también
reciben `p_user_id`.

**Upcoming Booking** (veredicto server y GET): `status in
('pending_payment','confirmed','in_progress','claim_open')` y
`checkout >= current_date`.

## Decisiones

- **RPCs security-definer solo para `service_role`, sin políticas RLS de escritura nuevas** (adaptado tras el pull de `main`, que dejó todas las RPC con ese lockdown): una sola
  función atómica cubre las 5 tablas y chequea ownership con
  `owns_business`/`owns_listing`. Alternativa descartada: 3 policies extra +
  inserts parciales con compensación (más superficie, menos atómico). El
  admin client sube/borra objetos en Storage y llama a las RPC; el chequeo de
  dueño lo hace la propia función con el `user.id` verificado.
- **`published` al crear**: es la semántica actual del wizard ("el Lodging
  nace publicado") y la que espera el catálogo; `draft` habría dejado el
  alta invisible y roto el flujo.
- **Ventana de availability: 365 noches `open`** desde hoy (hora local de la
  property). `book_stay` exige una fila por noche; sin ella la noche es
  unbookable.
- **Moneda/timezone por país del lugar geocodificado** (`COUNTRY_FIAT` /
  `COUNTRY_TIMEZONE` en `shared.ts`, espejo de `ownerFiat`): nada de `AR`/`ARS`
  hardcodeado como en `onboard`. `countryCode` en el GET sale del primer
  Lodging del Owner (la tabla `businesses` no tiene país) — default `AR`.
- **Fotos**: el wizard manda data URLs JPEG comprimidas (las de `PhotoPicker`)
  o URLs ya públicas (las que venían de la base al editar); el server sube las
  primeras a `<business_id>/<listing_id>/` y guarda la URL pública en
  `listing_photos.url`. Si la RPC falla tras subir, los objetos se borran.
- **Amenities**: campo de texto libre del wizard, una línea = un label →
  `ensure_amenity`. Labels que no machean el catálogo canónico crean filas
  nuevas en `servicios` (ej. "Wi-Fi" ≠ `wifi`), documentado arriba.

## Verificación

- `pnpm type-check` — pasa (3/3 paquetes).
- `pnpm lint` — pasa (sin warnings nuevos).
- `pnpm --filter web exec vitest run` — pasa (73/73).
- Docker y `supabase` CLI no están disponibles en esta máquina: la migración
  **no pudo ejecutarse** ni en local ni en remoto. Revisada a mano contra el
  esquema (enums `booking_status`/`listing_status`/`property_type`, columnas
  NOT NULL de `properties`, PK `(listing_id, night)`, helpers `owns_*`,
  sintaxis de `storage.buckets`/`storage.objects`).

### Verificación manual pendiente (contra la base, tras aplicar la migración)

1. `supabase db push` (o `migration up`) — **pedir al coordinador antes**.
2. Login como Owner con negocio → dashboard → "Sumar otro alojamiento" →
   completar wizard con 2 fotos → Publicar.
3. En la base: fila en `properties` + `listings` (`status='published'`), 2
   filas en `listing_photos` (URLs `.../storage/v1/object/public/listing-photos/...`,
   `is_cover` en la primera), filas en `listing_amenities` y 365 filas
   `open` en `availability_nights`.
4. Recargar o abrir en otro navegador: el Lodging sigue listado (no depende
   de localStorage).
5. Con un Booking `confirmed`/`in_progress`/`pending_payment`/`claim_open`
   con `checkout` futuro sobre ese listing: el dashboard lo muestra sin
   opción de eliminar ni de cambiar ubicación, y `PATCH`/`DELETE` devuelven
   409 aunque se los fuerce.

## Queda pendiente

- Aplicar la migración (requiere OK del coordinador sobre la base remota).
- E2E (`e2e/create-lodging.spec.ts` y relacionados) corren contra el modo
  mock; cubrir el flujo Supabase necesita fixtures de auth/Storage — no hecho.
- `businesses` no tiene columna `country`: el `countryCode` del GET se infiere
  del primer Lodging (default `AR`). Si el Owner puede tener Lodgings en
  países distintos del suyo, convendría persistir el país del negocio en el
  onboard.
