#!/usr/bin/env node
/**
 * Golden-program check for the nomai OpenUI catalog (AppLess pattern):
 * exemplar ```openui-lang programs — the same screens the Agent is taught to
 * emit in agent/instructions/openui.ts — run through the real parser against
 * the exact spec module the agent bundle consumes.
 *
 * For each golden program we assert a clean parse: no validation errors, no
 * unresolved/orphaned refs, and a root element resolved to the catalog root
 * (Stack). Two negative cases prove the check isn't vacuous. Any failure
 * exits 1.
 *
 * Parser wiring mirrors apps/web's Renderer, which does
 * createStreamingParser(library.toJSONSchema(), library.root) — here
 * spec.schema is that generated JSON schema and spec.root is "Stack".
 *
 * Run from apps/agent (imports resolve against its node_modules):
 *   node scripts/check-openui-golden.mjs      # or: pnpm test:openui
 *
 * Regenerate the spec after touching the catalog — see sync-openui-spec.mjs.
 */
import { createParser } from "@openuidev/lang-core";

import spec from "../agent/lib/openui-spec.ts";

const parser = createParser(spec.schema, spec.root);

/** Canonical screens — keep aligned with COMPOSITION_RECIPES in
 *  agent/instructions/openui.ts. */
const GOLDEN = [
  {
    name: "search results (ListingCard x2 + ChipRow refinements)",
    code: `root = Stack([note, card1, card2, refinements])
note = TextContent("3 opciones en Cafayate, todas directo con el dueño", "small")
card1 = ListingCard("Posada Los Cardones", "Cafayate", "US$ 60 / noche", "directo con el dueño", @ToAssistant("Quiero reservar Posada Los Cardones, Cafayate"), "Patio interno con parrilla", "CRD", "https://ejemplo.com/cover1.jpg")
card2 = ListingCard("Cabaña El Molino", "Cafayate", "US$ 74 / noche", "directo con el dueño", @ToAssistant("Quiero reservar Cabaña El Molino, Cafayate"), "Molino restaurado con vista a la quebrada", "MOL", "https://ejemplo.com/cover2.jpg")
refinements = ChipRow([{label: "Solo posadas", action: @ToAssistant("Mostrame solo posadas en Cafayate")}, {label: "Otra zona", action: @ToAssistant("Buscame opciones en otra zona")}])`,
  },
  {
    name: "listing detail (SectionHeader + ImageGrid + DetailList + AmenityChips + QuoteForm)",
    code: `root = Stack([head, photos, details, amenities, form])
head = SectionHeader("Posada Los Cardones", "Cafayate")
photos = ImageGrid(["https://ejemplo.com/cover.jpg", "https://ejemplo.com/2.jpg", "https://ejemplo.com/3.jpg"], "Posada Los Cardones")
details = DetailList([{label: "Check-in", value: "15:00"}, {label: "Check-out", value: "11:00"}, {label: "Huéspedes máx.", value: "4"}, {label: "Mínimo de noches", value: "2"}, {label: "Cancelación", value: "Flexible"}, {label: "Owner", value: "Hostería del Valle"}])
amenities = AmenityChips(["Wi-Fi", "Piscina", "Parrilla"])
form = QuoteForm(@ToAssistant("Cotizá Posada Los Cardones con estas fechas"), "Elegí fechas y huéspedes")`,
  },
  {
    name: "quote (QuoteCard with fee/total line kinds)",
    code: `root = Stack([quote])
quote = QuoteCard("Posada Los Cardones · 3 noches", [{label: "3 noches", value: "US$ 180"}, {label: "Limpieza", value: "US$ 15"}, {label: "FX fee nomai", value: "US$ 2", kind: "fee"}, {label: "Total", value: "US$ 201", kind: "total"}], @ToAssistant("Sí, confirmo la reserva"))`,
  },
  {
    name: "confirmed booking (BookingCard)",
    code: `root = Stack([ticket])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Huéspedes", value: "2"}, {label: "Total", value: "US$ 201"}])`,
  },
  {
    name: "comparison (Table, first column = row labels)",
    code: `root = Stack([head, table])
head = SectionHeader("Compará tus opciones", "Cafayate")
table = Table(["", "Posada Los Cardones", "Cabaña El Molino"], [["Precio por noche", "US$ 60", "US$ 74"], ["Huéspedes máx.", "4", "6"], ["Mínimo de noches", "2", "1"]])`,
  },
  {
    name: "listing detail with map + calendar (SectionHeader + ImageGrid + DetailList + AmenityChips + MapCard + AvailabilityPicker)",
    code: `root = Stack([head, photos, details, amenities, map, calendar])
head = SectionHeader("Posada Los Cardones", "Cafayate")
photos = ImageGrid(["https://ejemplo.com/cover.jpg", "https://ejemplo.com/2.jpg"], "Posada Los Cardones")
details = DetailList([{label: "Check-in", value: "15:00"}, {label: "Check-out", value: "11:00"}, {label: "Huéspedes máx.", value: "4"}])
amenities = AmenityChips(["Wi-Fi", "Piscina"])
map = MapCard(-26.0735, -65.9775, "Posada Los Cardones, Cafayate", 14)
calendar = AvailabilityPicker(["2026-11-03", "2026-11-04", "2026-11-12"], @ToAssistant("Cotizá Posada Los Cardones con estas fechas"))`,
  },
  {
    name: "quote with Service fee (QuoteCard serviceFee)",
    code: `root = Stack([quote])
quote = QuoteCard("Posada Los Cardones · 3 noches", [{label: "3 noches", value: "US$ 180"}, {label: "Limpieza", value: "US$ 15"}, {label: "Total", value: "US$ 201", kind: "total"}], @ToAssistant("Sí, confirmo la reserva"), "US$ 6")`,
  },
  {
    name: "booking status (BookingCard status + cancel, Stepper)",
    code: `root = Stack([ticket, steps])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Total", value: "US$ 201"}], "confirmed", @ToAssistant("Quiero cancelar la reserva bkg_12"))
steps = Stepper([{label: "Pago", status: "done"}, {label: "Confirmada", status: "current"}, {label: "Estadía", status: "next"}, {label: "Finalizada", status: "next"}])`,
  },
  {
    name: "claim (SectionHeader + StatusBadge + ClaimCard)",
    code: `root = Stack([head, badge, claim])
head = SectionHeader("Reclamo", "Posada Los Cardones · bkg_12")
badge = StatusBadge("En curso", "terra")
claim = ClaimCard("bkg_12", @ToAssistant("Abrí un reclamo para la reserva bkg_12"))`,
  },
  {
    name: "trip summary (MetricRow + StatusBadge)",
    code: `root = Stack([head, metrics, Stack([StatusBadge("Reembolsada", "neutral"), StatusBadge("Pago pendiente", "amber")], "row", "sm")])
head = SectionHeader("Tus viajes")
metrics = MetricRow([{label: "Pagado", value: "US$ 402", note: "2 reservas"}, {label: "Noches", value: "6"}, {label: "Service fee", value: "US$ 12"}])`,
  },
  {
    name: "traveler wallet (SectionHeader + MetricRow, after check_wallet)",
    code: `root = Stack([head, metrics])
head = SectionHeader("Tu wallet nomai", "celo-sepolia")
metrics = MetricRow([{label: "Saldo", value: "0.5 CELO"}, {label: "Dirección", value: "0x9f3c…b21a"}])`,
  },
  {
    name: "bare Stack (single inline TextContent child)",
    code: `root = Stack([TextContent("Solo una nota corta")])`,
  },
  {
    name: "cancel confirm (ApprovalCard with danger option + dismiss)",
    code: `root = Stack([ask])
ask = ApprovalCard("¿Cancelás la reserva bkg_12?", [{label: "Sí, cancelarla", value: "confirm", tone: "danger"}, {label: "No, mantenerla", value: "keep"}], @ToAssistant("Decidí sobre la cancelación de la reserva bkg_12"), "Recuperás US$ 208.65 — el Service fee no vuelve", @ToAssistant("Decidir después"))`,
  },
  {
    name: "booking status live (BookingCard + TaskRows + MetricRow)",
    code: `root = Stack([ticket, rows, escrow])
ticket = BookingCard("Posada Los Cardones", "bkg_12", [{label: "Check-in", value: "2026-03-12"}, {label: "Check-out", value: "2026-03-15"}, {label: "Total", value: "US$ 208.65"}], "confirmed", @ToAssistant("cancelar reserva bkg_12"))
rows = TaskRows([{label: "Reservada", status: "done"}, {label: "Pagada", status: "done", detail: "US$ 208.65"}, {label: "Check-in", status: "pending", detail: "2026-03-12"}, {label: "Estadía", status: "pending", detail: "2026-03-15"}, {label: "Fondos liberados", status: "pending", detail: "2026-03-13"}])
escrow = MetricRow([{label: "Deadline de cancelación", value: "2026-03-07", note: "100% de reembolso hasta acá"}, {label: "1ª liberación", value: "2026-03-07", note: "50% al Owner"}, {label: "Liberación final", value: "2026-03-13", note: "si no hay Claim"}])`,
  },
  {
    name: "top pick (RecommendationCard with alternatives)",
    code: `root = Stack([pick])
pick = RecommendationCard("Posada Los Cardones", "La mejor valorada de Cafayate y entra tu grupo de 4", 86, @ToAssistant("Quiero reservar Posada Los Cardones, Cafayate"), [{label: "Cabaña El Molino · US$ 74 / noche", action: @ToAssistant("Contame más de Cabaña El Molino")}, {label: "Hostería del Valle · US$ 95 / noche", action: @ToAssistant("Contame más de Hostería del Valle")}])`,
  },
];

/** Programs that MUST fail validation — guard against a vacuous check.
 *  `code` is the ValidationError.code we expect among meta.errors. */
const NEGATIVE = [
  {
    name: "unknown component",
    code: `root = Stack([nope])
nope = NopeCard("x")`,
    expectCode: "unknown-component",
  },
  {
    name: "wrong arg type (number for string prop)",
    code: `root = Stack([h])
h = SectionHeader(42)`,
    expectCode: "type-mismatch",
  },
  {
    name: "enum value outside the contract (StatusBadge tone)",
    code: `root = Stack([b])
b = StatusBadge("Confirmada", "green")`,
    expectCode: "type-mismatch",
  },
];

let failures = 0;

for (const { name, code } of GOLDEN) {
  const result = parser.parse(code);
  const problems = [];
  if (result.meta.errors.length > 0) {
    problems.push(
      ...result.meta.errors.map(
        (e) => `  ${e.code} [${e.component}${e.path}] ${e.message}`,
      ),
    );
  }
  if (result.meta.unresolved.length > 0) {
    problems.push(`  unresolved refs: ${result.meta.unresolved.join(", ")}`);
  }
  if (result.meta.orphaned.length > 0) {
    problems.push(
      `  orphaned statements (unreachable from root): ${result.meta.orphaned.join(", ")}`,
    );
  }
  if (result.root?.typeName !== spec.root) {
    problems.push(
      `  root did not resolve to ${spec.root} (got ${result.root?.typeName ?? "null"})`,
    );
  }
  if (problems.length > 0) {
    failures++;
    console.error(`✗ ${name}`);
    for (const p of problems) console.error(p);
  } else {
    console.log(`✓ ${name}`);
  }
}

for (const { name, code, expectCode } of NEGATIVE) {
  const result = parser.parse(code);
  const hit = result.meta.errors.some((e) => e.code === expectCode);
  if (result.meta.errors.length === 0) {
    failures++;
    console.error(`✗ negative: ${name} — expected errors, got none`);
  } else if (!hit) {
    failures++;
    console.error(
      `✗ negative: ${name} — expected a "${expectCode}" error, got:`,
    );
    for (const e of result.meta.errors) {
      console.error(`  ${e.code} [${e.component}${e.path}] ${e.message}`);
    }
  } else {
    console.log(`✓ negative: ${name} (rejected with "${expectCode}")`);
  }
}

console.log(
  `\n${GOLDEN.length} golden programs, ${NEGATIVE.length} negative cases — ${failures === 0 ? "all passed" : `${failures} FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
