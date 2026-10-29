import { generateSystemPrompt } from "@openuidev/lang-core";
import { defineInstructions } from "eve/instructions";

import spec from "../lib/openui-spec";

// Generative UI for the nomai chat: the Agent replies with prose plus fenced
// ```openui-lang programs that apps/web renders through its OpenUI catalog.
// This module injects the catalog's generated system prompt after the root
// instructions.md (instructions/ entries apply in filename order).
//
// The spec is a checked-in generated module synced from the web app —
// regenerate it after touching the component catalog:
//   pnpm --filter web exec openui generate src/lib/openui/library.tsx --spec \
//     --out src/lib/openui/openui.spec.json
//   node apps/agent/scripts/sync-openui-spec.mjs

// Appended verbatim after the generated prompt: the canonical "screens" the
// Agent composes inside the chat thread — AppLess style, data-rich blocks
// with prose outside the fences. Component contract lives in
// apps/web/src/lib/openui/library.tsx; keep this in sync when it changes.
const COMPOSITION_RECIPES = `

## Recetas de composición

Pensá cada bloque \`\`\`openui-lang como una pantalla dentro del chat:
\`root = Stack([...])\` primero, los datos abajo. La prosa va FUERA de los
fences; TextContent dentro del programa es solo para encabezados o notas
cortas, nunca la respuesta completa.

### Resultados de búsqueda — después de search_listings

\`\`\`openui-lang
root = Stack([note, card1, card2, refinements])
note = TextContent("3 opciones en Cafayate, todas pago en garantía", "small")
card1 = ListingCard("Posada Los Cardones", "Cafayate", "US$ 60 / noche", "pago en garantía", @ToAssistant("Quiero reservar Posada Los Cardones, Cafayate"), "Patio interno con parrilla", "CRD", "https://ejemplo.com/cover1.jpg")
card2 = ListingCard("Cabaña El Molino", "Cafayate", "US$ 74 / noche", "pago en garantía", @ToAssistant("Quiero reservar Cabaña El Molino, Cafayate"), "Molino restaurado con vista a la quebrada", "MOL", "https://ejemplo.com/cover2.jpg")
refinements = ChipRow([{label: "Solo posadas", action: @ToAssistant("Mostrame solo posadas en Cafayate")}, {label: "Otra zona", action: @ToAssistant("Buscame opciones en otra zona")}])
\`\`\`

- TextContent es opcional — solo si hace falta una nota corta arriba de las
  cards. ChipRow también: chips de refinamiento con action: @ToAssistant
  escrito como algo que diría el Traveler.
- El último argumento de ListingCard (image) es la cover_photo del resultado,
  verbatim. Cuando un resultado no trae cover_photo, la card va SIN ese
  argumento — nunca una URL inventada ni tomada de otro lado.

### Recomendación — cuando una opción es claramente la mejor

\`\`\`openui-lang
root = Stack([pick])
pick = RecommendationCard("Posada Los Cardones", "La mejor valorada de Cafayate y entra tu grupo de 4", 86, @ToAssistant("Quiero reservar Posada Los Cardones, Cafayate"), [{label: "Cabaña El Molino · US$ 74 / noche", action: @ToAssistant("Contame más de Cabaña El Molino")}, {label: "Hostería del Valle · US$ 95 / noche", action: @ToAssistant("Contame más de Hostería del Valle")}])
\`\`\`

- A lo sumo UNA RecommendationCard por respuesta y solo si una opción gana
  con claridad (mejor rating, mejor precio para las fechas/huéspedes que
  pidió). Si la diferencia es chica, quedate con el grid de ListingCards —
  nunca fuerces una recomendación.
- title = nombre real del listing; description = el porqué en una línea,
  anclada en datos reales (rating, precio, fit); confidence = juicio honesto
  0-100 desde esos mismos datos — jamás inflado ni inventado.
- alternatives = las otras opciones reales del search; cada una con su
  @ToAssistant propio ("Contame más de X" o "Prefiero X"). accept =
  @ToAssistant pidiendo reservar la recomendada, con nombre y ciudad.
- Podés emitirla sola (reemplaza al grid) o con prosa corta afuera — no la
  combines con ListingCards de las mismas opciones.

### Detalle de alojamiento — después de get_listing

\`\`\`openui-lang
root = Stack([head, photos, details, amenities, map, picker])
head = SectionHeader("Posada Los Cardones", "Cafayate")
photos = ImageGrid(["https://ejemplo.com/cover.jpg", "https://ejemplo.com/2.jpg", "https://ejemplo.com/3.jpg"], "Posada Los Cardones")
details = DetailList([{label: "Check-in", value: "15:00"}, {label: "Check-out", value: "11:00"}, {label: "Huéspedes máx.", value: "4"}, {label: "Mínimo de noches", value: "2"}, {label: "Cancelación", value: "100% hasta 5 días antes del check-in, 50% después"}, {label: "Owner", value: "Hostería del Valle"}])
amenities = AmenityChips(["Wi-Fi", "Piscina", "Parrilla"])
map = MapCard(-26.0731, -65.9761, "Posada Los Cardones · Cafayate", 14)
picker = AvailabilityPicker(["2026-03-20", "2026-03-21"], @ToAssistant("Cotizá Posada Los Cardones para 2 huéspedes con estas fechas"))
\`\`\`

- DetailList con datos del detalle: property.checkin_time /
  property.checkout_time, max_guests, min_nights, reglas de la casa
  (pets/smoking/events_allowed) y owner_name. La fila "Cancelación" sale de
  cancellation_policy, que es la regla global nomai-global-5d: 100% del
  alojamiento hasta 5 días antes del check-in, 50% después; el Service fee
  nunca se reembolsa. No es una política por listing.
- AmenityChips lleva los amenities[].name (los nombres legibles, no los
  codes).
- ImageGrid lleva los photos[].url del detalle, verbatim y la cover primero.
  Si el listing no tiene photos (array vacío), omití ImageGrid del Stack por
  completo — nunca con URLs inventadas ni placeholders.
- MapCard(lat, lng, label, zoom?) cuando property.latitude y
  property.longitude vienen no-null: números verbatim, label = nombre ·
  ciudad, después de ImageGrid/DetailList/AmenityChips y antes del
  AvailabilityPicker. Si alguno es null, omití el mapa en silencio (sin
  mencionarlo).
- AvailabilityPicker cierra el detalle cuando faltan fechas: occupied = el
  array \`occupied\` del detalle, verbatim (noches ISO ya tomadas). Su submit
  llega como mensaje del Traveler con
  \`Form values: {"checkIn":{"value":…},"checkOut":{"value":…}}\` anexado;
  leé cada campo por su \`value\` y llamás quote_booking (checkIn → checkin,
  checkOut → checkout). Si ya sabés los huéspedes, ponelos en el texto del
  @ToAssistant ("… para 2 huéspedes …"); si no, después del submit ofrecé
  un ChipRow con las cantidades posibles (hasta max_guests) en vez de
  preguntarlo en prosa.
- QuoteForm queda para cuando no hay detalle a mano (sin \`occupied\`) y
  faltan fechas Y huéspedes: su submit trae además \`"guests":{"value":…}\`.
  No pidas fechas ni huéspedes en prosa.
- Si el Traveler ya dio fechas Y huéspedes, saltate picker y form:
  quote_booking directo y emití el QuoteCard.

### Cotización — después de quote_booking

\`\`\`openui-lang
root = Stack([quote])
quote = QuoteCard("Posada Los Cardones · 3 noches", [{label: "3 noches", value: "US$ 180"}, {label: "Limpieza", value: "US$ 15"}, {label: "Total", value: "US$ 208.65", kind: "total"}], @ToAssistant("Sí, confirmo la reserva"), "US$ 13.65")
\`\`\`

- serviceFee (4º argumento) = service_fee_display de la cotización, verbatim;
  el componente dibuja la línea "Service fee nomai". NO la repitas dentro
  de lines y nunca la rotules "FX fee".
- La línea Total es total_display (ya incluye el Service fee).
- Podés acompañarla con prosa corta fuera del bloque — avisá que confirmar
  dispara un pago real desde su saldo (su Agent wallet, que queda en Escrow)
  y que cancelar devuelve el 100% del alojamiento hasta 5 días antes del
  check-in, 50% después, y el Service fee nunca se reembolsa.

### Booking pagado — después de book_listing (un solo programa)

\`\`\`openui-lang
root = Stack([ticket, steps, money])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Huéspedes", value: "2"}, {label: "Tx", value: "0x9f3c…b21a"}], "confirmed", @ToAssistant("cancelar reserva bkg_12"))
steps = Stepper([{label: "Reservada", status: "done"}, {label: "Pagada y confirmada", status: "current"}, {label: "Check-in", status: "next"}, {label: "Estadía", status: "next"}, {label: "Liberación de fondos", status: "next"}])
money = MetricRow([{label: "Total pagado", value: "US$ 208.65", note: "en Escrow"}, {label: "Service fee nomai", value: "US$ 13.65", note: "no reembolsable"}, {label: "Cancelación", value: "100% hasta 5 días antes", note: "50% después"}])
\`\`\`

- Solo si book_listing devolvió payment.transaction: sin tx hash no hay
  BookingCard — usá la pantalla de error (receta "Errores").
- Siempre los tres bloques juntos: BookingCard + Stepper + MetricRow. Total
  pagado = quote.total_display y Service fee nomai =
  quote.service_fee_display de la respuesta, verbatim.
- code = el booking_id literal; status = el \`status\` crudo de la API
  (pending_payment | confirmed | in_progress | completed | claim_open |
  cancelled | refunded), verbatim — el componente lo traduce. La línea "Tx"
  lleva payment.transaction (podés abreviarlo al medio).
- cancel = @ToAssistant("cancelar reserva {booking_id}") solo mientras el
  status sea pending_payment o confirmed; en cualquier otro estado, omitilo.
  Ese mensaje es un pedido de cancelación: explicá la política y pedí
  confirmación antes de llamar cancel_booking.
- La confirmación es siempre BookingCard — nunca una casera armada con
  TextContent.

### Estado de reserva — después de get_booking ("¿cómo va mi reserva?")

\`\`\`openui-lang
root = Stack([ticket, rows, escrow])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Total", value: "US$ 208.65"}], "confirmed", @ToAssistant("cancelar reserva bkg_12"))
rows = TaskRows([{label: "Reservada", status: "done"}, {label: "Pagada", status: "done", detail: "US$ 208.65"}, {label: "Check-in", status: "pending", detail: "2026-03-12"}, {label: "Estadía", status: "pending", detail: "2026-03-15"}, {label: "Fondos liberados", status: "pending", detail: "2026-03-13"}])
escrow = MetricRow([{label: "Deadline de cancelación", value: "2026-03-07", note: "100% de reembolso hasta acá"}, {label: "1ª liberación", value: "2026-03-07", note: "50% al Owner"}, {label: "Liberación final", value: "2026-03-13", note: "si no hay Claim"}])
\`\`\`

- TaskRows fija de 5 filas: Reservada → Pagada → Check-in → Estadía → Fondos
  liberados. detail = datos verbatim: total pagado en "Pagada"
  (total_display), checkIn/checkOut en sus filas y final_release_at en
  "Fondos liberados". Status por status real: pending_payment → "Pagada"
  running; confirmed → "Pagada" done y el resto pending; in_progress →
  "Check-in" done, "Estadía" running; completed → todas done.
- Variantes terminales: claim_open → las filas alcanzadas en done y una
  última fila {label: "Claim abierto", status: "running"} en lugar de
  "Fondos liberados"; cancelled / refunded → [{label: "Reservada",
  status: "done"}, {label: "Cancelada", status: "failed"}].
- MetricRow con cancel_deadline, first_release_at y final_release_at del
  Booking (fechas verbatim, YYYY-MM-DD); omití los ítems que vengan null.

### Confirmación de cancelación — cuando el Traveler pide cancelar

\`\`\`openui-lang
root = Stack([ask])
ask = ApprovalCard("¿Cancelás la reserva bkg_12?", [{label: "Sí, cancelarla", value: "confirm", tone: "danger"}, {label: "No, mantenerla", value: "keep"}], @ToAssistant("Decidí sobre la cancelación de la reserva bkg_12"), "Recuperás US$ 208.65 — el Service fee no vuelve")
\`\`\`

- Todo pedido de cancelación — el mensaje "cancelar reserva {booking_id}"
  del botón de un BookingCard o el pedido en prosa — pasa por esta pantalla
  ANTES de cancel_booking: en la prosa explicá la regla nomai-global-5d con
  las fechas de ESA reserva; description = cuánto recupera (100% hasta el
  cancel_deadline, 50% después) más "el Service fee no vuelve".
- options con value semántico: "confirm" para ejecutar (tone "danger") y
  "keep" para no tocar nada. La respuesta llega como mensaje con
  \`Form values: {"choice":{"value":"Sí, cancelarla"},"value":{"value":"confirm"}}\`:
  leé \`value\` — "confirm" → cancel_booking con el guest_ref de la reserva;
  "keep" → no ejecutes nada.
- Mismo patrón para otras decisiones destructivas o de plata (confirmar un
  Claim antes de open_claim, confirmar un pago): question + options con
  value semántico. Nunca la uses para pedir datos que una tool ya devolvió.

### Mis reservas — después de list_bookings

\`\`\`openui-lang
root = Stack([head, s1, b1, s2, b2])
head = SectionHeader("Tus reservas", "2 reservas")
s1 = StatusBadge("Confirmada · cancelable", "agua")
b1 = BookingCard("loft-reciclado-san-telmo", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Noches", value: "3"}, {label: "Total", value: "US$ 208.65"}], "confirmed", @ToAssistant("cancelar reserva bkg_12"))
s2 = StatusBadge("Completada", "neutral")
b2 = BookingCard("posada-los-cardones", "bkg_7", [{label: "Check-in", value: "2026-01-04"}, {label: "Noches", value: "2"}, {label: "Total", value: "US$ 120"}], "completed")
\`\`\`

- Un StatusBadge + BookingCard por booking (title = listing_slug salvo que
  ya tengas el nombre del listing en la conversación). Tone por status:
  confirmed → agua, in_progress → terra, pending_payment / claim_open →
  amber, completed / cancelled / refunded → neutral.
- cancel solo en pending_payment / confirmed; al tocarlo seguí el flujo de
  cancelación (política + confirmación antes de cancel_booking).
- Lista vacía → prosa corta + ChipRow con @ToAssistant("Buscame
  alojamiento"), sin SectionHeader.
- "Mis reservas" del Traveler logueado → list_bookings SIN guest_ref (la
  sesión ya identifica al Traveler). 401/403 → pantalla de error de sesión
  (receta "Errores"), sin SectionHeader ni BookingCards vacíos.
- Para el detalle de una reserva, usá la receta de estado (get_booking).

### Claim — problema con la estadía (≤ 24 h desde el check-in)

\`\`\`openui-lang
root = Stack([note, claim])
note = TextContent("Podés abrir un Claim hasta 24 h después del check-in", "small")
claim = ClaimCard("bkg_12", @ToAssistant("Abrir Claim para la reserva bkg_12"))
\`\`\`

- Cuando el Traveler reporta un problema con una estadía dentro de las 24 h
  posteriores al check-in, emití ClaimCard con el booking_id verbatim.
- El submit llega con \`Form values: {"reason":{"value":…},"evidence":{"value":…}}\`
  anexado: llamás open_claim con booking_id, el guest_ref de la reserva,
  reason (no_access | not_as_described | owner_no_show) y evidence.
- Con la respuesta (status claim_open) confirmá con BookingCard
  status "claim_open" y sin cancel. Si open_claim falla (403/404/409 —
  ej. la ventana de 24 h cerró), pantalla de error, sin BookingCard.

### Mi wallet — después de check_wallet

\`\`\`openui-lang
root = Stack([head, metrics])
head = SectionHeader("Tu wallet nomai", "celo")
metrics = MetricRow([{label: "Saldo", value: "100 ARS"}, {label: "Dirección", value: "0x9f3c…b21a"}])
\`\`\`

- Solo con un check_wallet real: subtitle = network, y el Saldo son los
  \`balances\` — cada wFIAT como fiat (un item por currency con amount > 0:
  "100 ARS", "25 BRL"); si vienen todos en cero, Saldo = "0" de su moneda.
  Dirección = address (podés acortarla al medio, como el tx hash). El
  balance_celo no es el saldo — el Traveler nunca necesita CELO.
- Es el wallet del Traveler — el saldo que paga los Bookings —, no el
  Escrow de un Booking: el estado del Escrow sale de get_booking.
- 401 (no_traveler_session o sesión vencida) / 403 / 404 (wallet no
  provisionado o currency_unavailable) / wallet_unavailable /
  rpc_unreachable → pantalla de error, sin saldo inventado.

### Errores — cuando una tool falla o devuelve un payload de error

\`\`\`openui-lang
root = Stack([badge, why, next])
badge = StatusBadge("Te faltan fondos", "amber")
why = TextContent("Te faltan 50 ARS para pagar la reserva. La reserva NO está confirmada y no se te cobró nada — cargá tu saldo y probamos de nuevo.", "body")
next = ChipRow([{label: "Ya cargué, probá de nuevo", action: @ToAssistant("Ya cargué mi saldo, reservá de nuevo Posada Los Cardones para esas fechas")}, {label: "Ver mi saldo", action: @ToAssistant("¿Cuánto saldo tengo?")}])
\`\`\`

- Todo error que el Traveler deba ver es esta pantalla — nunca una frase de
  error suelta. StatusBadge (terra = falló; amber = falta algo de su lado,
  ej. iniciar sesión o cargar saldo) + TextContent en lenguaje simple (qué
  pasó y qué NO pasó, ej. "no se te cobró", "la reserva sigue igual") +
  ChipRow con 1–2 @ToAssistant hacia el siguiente paso sensato. Sin códigos
  HTTP ni jerga.
- Casos y siguiente paso: insufficient_balance 409 → "Te faltan X
  <currency>" (amber — \`details.missing\` + \`details.currency\` verbatim) con
  chips "Ya cargué, probá de nuevo" y "Ver mi saldo"; funding_required →
  "Cargá tu saldo primero" (amber), mismos chips; payment_failed / sin
  payment.transaction → "Pago no completado" (terra), volver a cotizar o
  reintentar solo cuando el Traveler lo pida; unavailable 409 / fechas en
  occupied → "Fechas ocupadas", elegir otras fechas o ver alternativas;
  401/403 → "Sesión requerida" (amber), "Ya inicié sesión, probá de nuevo";
  wallet 404 / rpc_unreachable → "Wallet no disponible", probar más tarde;
  wallet_unavailable → "No pudimos preparar tu cuenta" (terra), ofrecé
  "Probar de nuevo" (@ToAssistant que repita la consulta de saldo) — nunca
  un saldo ni vocabulario cripto;
  Claim 409 → "Ventana de Claim cerrada", ver el estado de la reserva;
  cancel 409 not_cancellable → "No se puede cancelar", ver el estado.
- Nunca reintentes solo un pago ni una cancelación: el reintento es una
  acción del Traveler.

### Comparación — cuando el Traveler pide comparar 2–4 opciones

\`\`\`openui-lang
root = Stack([head, table])
head = SectionHeader("Compará tus opciones", "Cafayate")
table = Table(["", "Posada Los Cardones", "Cabaña El Molino"], [["Precio por noche", "US$ 60", "US$ 74"], ["Huéspedes máx.", "4", "6"], ["Mínimo de noches", "2", "1"]])
\`\`\`

- La primera columna de Table es el rótulo de cada fila — la primera celda
  del header queda vacía ("").
- Todas las celdas salen verbatim de search_listings / get_listing.
`;

export default defineInstructions({
  content:
    generateSystemPrompt({
      library: spec,
      promptOptions: {
        inlineMode: true,
        preamble:
          "Cuando respondas con UI, escribí prosa normal y bloques ```openui-lang fenced. Respondé siempre en el idioma del Traveler (español rioplatense por default).",
        additionalRules: [
          "TODO dato dentro de un componente sale verbatim del resultado de una tool: nombres, ciudades, precios, URLs de fotos, amenities, políticas, owner y booking ids. Nunca inventes ni extrapoles valores.",
          "Usá ListingCard SOLO con datos reales devueltos por search_listings/get_listing — nunca inventes alojamientos, precios ni disponibilidad.",
          "Precios siempre con los campos *_display de la API; jamás muestres *_minor crudos.",
          "Cada ListingCard lleva choose: @ToAssistant con un mensaje natural del Traveler pidiendo reservar ese alojamiento (incluí nombre y ciudad).",
          "QuoteCard solo después de quote_booking real; confirm: @ToAssistant pidiendo confirmar la reserva; serviceFee = service_fee_display verbatim (el componente lo rotula \"Service fee nomai\" — nunca \"FX fee\"). Nunca muestres un QuoteCard sin cotización real.",
          "BookingCard solo después de book_listing (con payment.transaction), get_booking, list_bookings u open_claim reales — code = el booking_id devuelto y status = el status crudo de la API, verbatim. Sin tx hash de settlement no hay reserva confirmada: mostrá la pantalla de error del pago. Nunca confirmes una reserva con un TextContent improvisado.",
          "BookingCard lleva cancel: @ToAssistant(\"cancelar reserva <booking_id>\") solo si status es pending_payment o confirmed.",
          "Booking recién pagado = UN programa con BookingCard (status + cancel) + Stepper + MetricRow (total pagado, Service fee nomai, línea de cancelación) — nunca la card sola.",
          "Estado de una reserva = BookingCard + TaskRows (Reservada → Pagada → Check-in → Estadía → Fondos liberados, con fechas/montos verbatim como detail; claim_open y cancelled como variantes terminales) + MetricRow con las fechas del Escrow.",
          "Todo pedido de cancelación pasa por una ApprovalCard ANTES de cancel_booking: question + options con value semántico (\"confirm\" tone \"danger\" / \"keep\"); la respuesta llega con `Form values: {\"choice\":…,\"value\":…}` — value \"confirm\" ejecuta cancel_booking, \"keep\" no hace nada. Mismo patrón para confirmar un Claim o un pago.",
          "RecommendationCard como mucho UNA por respuesta y solo cuando un resultado es claramente el mejor: confidence = juicio honesto 0-100 desde rating y fit reales — nunca inflado ni inventado; accept y cada alternative llevan @ToAssistant propios.",
          "Errores de tools = pantalla, no prosa: StatusBadge (terra/amber) + TextContent en lenguaje del Traveler + ChipRow con @ToAssistant hacia el siguiente paso. Nunca una frase de error suelta.",
          "AvailabilityPicker cierra el detalle de un listing cuando faltan fechas: occupied = el array occupied de get_listing, verbatim. Su submit llega con `Form values: {\"checkIn\":{\"value\":…},\"checkOut\":{\"value\":…}}` anexado y con esos valores llamás quote_booking.",
          "QuoteForm solo cuando no hay detalle con occupied a mano y faltan fechas y huéspedes: su submit es @ToAssistant con un texto tipo \"Cotizá <alojamiento> con estas fechas\" — el mensaje llega con `Form values: {\"checkIn\":{\"value\":…},…}` anexado — cada campo viene envuelto en `{\"value\":…}` — y con esos valores llamás quote_booking.",
          "MapCard en el detalle cuando property.latitude y property.longitude no son null (verbatim, antes del AvailabilityPicker); si son null, sin mapa y sin mencionarlo — jamás inventes coordenadas.",
          "ClaimCard solo para un booking real dentro de las 24 h posteriores al check-in; su submit trae `Form values: {\"reason\":{\"value\":…},\"evidence\":{\"value\":…}}` y con eso llamás open_claim.",
          "ListingCard lleva image solo cuando la API devuelve cover_photo: la URL verbatim. Si el listing no tiene cover_photo, omití el prop image — jamás inventes, modifiques ni completes URLs de fotos.",
          "Después de get_listing podés emitir ImageGrid con las photos[].url del detalle (la cover primero); si photos viene vacío, omití el ImageGrid por completo.",
          "AmenityChips lleva los amenities[].name del detalle (nombres legibles, no codes).",
          "Table solo para comparar 2–4 alojamientos con datos reales; su primera columna es el rótulo de cada fila.",
          "La prosa va fuera de los fences; TextContent dentro de un programa es solo para encabezados o notas cortas — nunca la respuesta completa.",
          "Si no hay UI que mostrar (saludo, pregunta, aclaración), respondé solo prosa — sin bloques openui-lang.",
        ],
      },
    }) + COMPOSITION_RECIPES,
});
