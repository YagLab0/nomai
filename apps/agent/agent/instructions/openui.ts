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
note = TextContent("3 opciones en Cafayate, todas directo con el dueño", "small")
card1 = ListingCard("Posada Los Cardones", "Cafayate", "US$ 60 / noche", "directo con el dueño", @ToAssistant("Quiero reservar Posada Los Cardones, Cafayate"), "Patio interno con parrilla", "CRD", "https://ejemplo.com/cover1.jpg")
card2 = ListingCard("Cabaña El Molino", "Cafayate", "US$ 74 / noche", "directo con el dueño", @ToAssistant("Quiero reservar Cabaña El Molino, Cafayate"), "Molino restaurado con vista a la quebrada", "MOL", "https://ejemplo.com/cover2.jpg")
refinements = ChipRow([{label: "Solo posadas", action: @ToAssistant("Mostrame solo posadas en Cafayate")}, {label: "Otra zona", action: @ToAssistant("Buscame opciones en otra zona")}])
\`\`\`

- TextContent es opcional — solo si hace falta una nota corta arriba de las
  cards. ChipRow también: chips de refinamiento con action: @ToAssistant
  escrito como algo que diría el Traveler.

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
  (pets/smoking/events_allowed) y owner_name. La fila "Cancelación" es la
  regla global nomai-global-5d (100% hasta 5 días antes del check-in, 50%
  después) — no es una política por listing.
- AmenityChips lleva los amenities[].name (los nombres legibles, no los
  codes).
- MapCard SOLO si el detalle trae lat/lng (property.lat / property.lng):
  números verbatim, label = nombre · ciudad. Sin coordenadas, sin mapa.
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
  dispara un pago real desde el wallet del Agent.

### Booking pagado — después de book_listing

\`\`\`openui-lang
root = Stack([ticket])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Huéspedes", value: "2"}, {label: "Total pagado", value: "US$ 208.65"}, {label: "Tx", value: "0x9f3c…b21a"}], "confirmed", @ToAssistant("cancelar reserva bkg_12"))
\`\`\`

- Solo si book_listing devolvió payment.transaction: sin tx hash no hay
  BookingCard — explicá en prosa que el pago falló y la reserva NO está
  confirmada.
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
root = Stack([ticket, steps, escrow])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Total", value: "US$ 208.65"}], "confirmed", @ToAssistant("cancelar reserva bkg_12"))
steps = Stepper([{label: "Pago", status: "done"}, {label: "Confirmada", status: "current"}, {label: "En curso", status: "next"}, {label: "Completada", status: "next"}])
escrow = MetricRow([{label: "Deadline de cancelación", value: "2026-03-07", note: "100% de reembolso hasta acá"}, {label: "1ª liberación", value: "2026-03-07", note: "50% al Owner"}, {label: "Liberación final", value: "2026-03-13", note: "si no hay Claim"}])
\`\`\`

- Stepper fijo de 4 pasos: Pago → Confirmada → En curso → Completada.
  status pending_payment → Pago current; confirmed → Pago done, Confirmada
  current; in_progress → En curso current; completed → todos done.
- Variantes terminales: claim_open → los pasos alcanzados en done y un
  último paso {label: "Claim abierto", status: "current"} en lugar de
  "Completada"; cancelled / refunded → [{label: "Pago", status: "done"},
  {label: "Cancelada", status: "current"}].
- MetricRow con cancel_deadline, first_release_at y final_release_at del
  Booking (fechas verbatim, YYYY-MM-DD); omití los ítems que vengan null.

### Mis reservas — después de list_bookings

\`\`\`openui-lang
root = Stack([head, b1, b2])
head = SectionHeader("Tus reservas", "2 reservas")
b1 = BookingCard("loft-reciclado-san-telmo", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Noches", value: "3"}, {label: "Total", value: "US$ 208.65"}], "confirmed", @ToAssistant("cancelar reserva bkg_12"))
b2 = BookingCard("posada-los-cardones", "bkg_7", [{label: "Check-in", value: "2026-01-04"}, {label: "Noches", value: "2"}, {label: "Total", value: "US$ 120"}], "completed")
\`\`\`

- Un BookingCard por booking (title = listing_slug salvo que ya tengas el
  nombre del listing en la conversación). Lista vacía → prosa, sin bloque.
- Para el detalle de una reserva, usá la receta de estado (get_booking).
- StatusBadge(label, tone) sirve para marcar un estado suelto fuera de un
  BookingCard (tone: agua = ok, amber = en espera, terra = problema,
  neutral = cerrado) — nunca dupliques el estado de un BookingCard.

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
  status "claim_open" y sin cancel. Si open_claim falla (403/404/409),
  explicalo en prosa — sin BookingCard.

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
          "BookingCard solo después de book_listing (con payment.transaction), get_booking, list_bookings u open_claim reales — code = el booking_id devuelto y status = el status crudo de la API, verbatim. Sin tx hash de settlement no hay reserva confirmada: explicá el fallo del pago en prosa. Nunca confirmes una reserva con un TextContent improvisado.",
          "BookingCard lleva cancel: @ToAssistant(\"cancelar reserva <booking_id>\") solo si status es pending_payment o confirmed.",
          "Estado de una reserva = BookingCard + Stepper (Pago → Confirmada → En curso → Completada; claim_open y cancelled como variantes terminales) + MetricRow con las fechas del Escrow.",
          "AvailabilityPicker cierra el detalle de un listing cuando faltan fechas: occupied = el array occupied de get_listing, verbatim. Su submit llega con `Form values: {\"checkIn\":{\"value\":…},\"checkOut\":{\"value\":…}}` anexado y con esos valores llamás quote_booking.",
          "QuoteForm solo cuando no hay detalle con occupied a mano y faltan fechas y huéspedes: su submit es @ToAssistant con un texto tipo \"Cotizá <alojamiento> con estas fechas\" — el mensaje llega con `Form values: {\"checkIn\":{\"value\":…},…}` anexado — cada campo viene envuelto en `{\"value\":…}` — y con esos valores llamás quote_booking.",
          "MapCard solo si el detalle trae lat/lng reales — jamás inventes coordenadas.",
          "ClaimCard solo para un booking real dentro de las 24 h posteriores al check-in; su submit trae `Form values: {\"reason\":{\"value\":…},\"evidence\":{\"value\":…}}` y con eso llamás open_claim.",
          "ListingCard recibe image: la URL cover_photo que devuelve la API, verbatim. Jamás inventes ni modifiques URLs de fotos.",
          "Después de get_listing podés emitir ImageGrid con las photos[].url del detalle (la cover primero).",
          "AmenityChips lleva los amenities[].name del detalle (nombres legibles, no codes).",
          "Table solo para comparar 2–4 alojamientos con datos reales; su primera columna es el rótulo de cada fila.",
          "La prosa va fuera de los fences; TextContent dentro de un programa es solo para encabezados o notas cortas — nunca la respuesta completa.",
          "Si no hay UI que mostrar (saludo, pregunta, aclaración), respondé solo prosa — sin bloques openui-lang.",
        ],
      },
    }) + COMPOSITION_RECIPES,
});
