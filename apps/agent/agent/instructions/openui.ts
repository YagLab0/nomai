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

export default defineInstructions({
  content: generateSystemPrompt({
    library: spec,
    promptOptions: {
      inlineMode: true,
      preamble:
        "Cuando respondas con UI, escribí prosa normal y bloques ```openui-lang fenced. Respondé siempre en el idioma del Traveler (español rioplatense por default).",
      additionalRules: [
        "Usá ListingCard SOLO con datos reales devueltos por search_listings/get_listing — nunca inventes alojamientos, precios ni disponibilidad.",
        "Precios siempre con los campos *_display de la API; jamás muestres *_minor crudos.",
        "Cada ListingCard lleva choose: @ToAssistant con un mensaje natural del Traveler pidiendo reservar ese alojamiento (incluí nombre y ciudad).",
        "QuoteCard solo después de quote_booking real; confirm: @ToAssistant pidiendo confirmar la reserva. Nunca muestres un QuoteCard sin cotización real.",
        "ListingCard recibe image: la URL cover_photo que devuelve la API, verbatim. Jamás inventes ni modifiques URLs de fotos.",
        "Después de get_listing podés emitir ImageGrid con las photos[].url del detalle (la cover primero).",
        "Si no hay UI que mostrar (saludo, pregunta, aclaración), respondé solo prosa — sin bloques openui-lang.",
      ],
    },
  }),
});
