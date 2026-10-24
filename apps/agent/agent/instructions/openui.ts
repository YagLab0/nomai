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
root = Stack([head, photos, details, amenities, form])
head = SectionHeader("Posada Los Cardones", "Cafayate")
photos = ImageGrid(["https://ejemplo.com/cover.jpg", "https://ejemplo.com/2.jpg", "https://ejemplo.com/3.jpg"], "Posada Los Cardones")
details = DetailList([{label: "Check-in", value: "15:00"}, {label: "Check-out", value: "11:00"}, {label: "Huéspedes máx.", value: "4"}, {label: "Mínimo de noches", value: "2"}, {label: "Cancelación", value: "Flexible"}, {label: "Owner", value: "Hostería del Valle"}])
amenities = AmenityChips(["Wi-Fi", "Piscina", "Parrilla"])
form = QuoteForm(@ToAssistant("Cotizá Posada Los Cardones con estas fechas"), "Elegí fechas y huéspedes")
\`\`\`

- DetailList con datos del detalle: property.checkin_time /
  property.checkout_time, max_guests, min_nights, reglas de la casa
  (pets/smoking/events_allowed), cancellation_policy y owner_name.
- AmenityChips lleva los amenities[].name (los nombres legibles, no los
  codes).
- QuoteForm va SIEMPRE que falten fechas o huéspedes — no pidas esos datos
  en prosa. Su @ToAssistant sale como mensaje del Traveler con
  \`Form values: {"checkIn":{"value":…},"checkOut":{"value":…},"guests":{"value":…}}\`
  anexado; leé cada campo por su \`value\` y con esos valores llamás
  quote_booking (checkIn → checkin, checkOut → checkout).
- Si el Traveler ya dio fechas Y huéspedes, saltate el form: quote_booking
  directo y emití el QuoteCard.

### Cotización — después de quote_booking

\`\`\`openui-lang
root = Stack([quote])
quote = QuoteCard("Posada Los Cardones · 3 noches", [{label: "3 noches", value: "US$ 180"}, {label: "Limpieza", value: "US$ 15"}, {label: "FX fee nomai", value: "US$ 2", kind: "fee"}, {label: "Total", value: "US$ 201", kind: "total"}], @ToAssistant("Sí, confirmo la reserva"))
\`\`\`

Podés acompañarla con prosa corta fuera del bloque.

### Booking confirmado — después de book_listing

\`\`\`openui-lang
root = Stack([ticket])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Huéspedes", value: "2"}, {label: "Total", value: "US$ 201"}])
\`\`\`

- code = el booking_id literal que devuelve book_listing.
- La confirmación es siempre BookingCard — nunca una casera armada con
  TextContent.

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
          "QuoteCard solo después de quote_booking real; confirm: @ToAssistant pidiendo confirmar la reserva. Nunca muestres un QuoteCard sin cotización real.",
          "BookingCard solo después de book_listing real — code = el booking_id devuelto, verbatim. Nunca confirmes una reserva con un TextContent improvisado.",
          "QuoteForm reemplaza a pedir fechas/huéspedes en prosa: su submit es @ToAssistant con un texto tipo \"Cotizá <alojamiento> con estas fechas\" — el mensaje llega con `Form values: {\"checkIn\":{\"value\":…},…}` anexado — cada campo viene envuelto en `{\"value\":…}` — y con esos valores llamás quote_booking.",
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
