/**
 * Live tool progress for the in-flight assistant message. The eve adapter
 * folds `actions.requested` / `action.result` into this list and ships it
 * through `metadata.custom[TOOL_STATUS_KEY]`; the chat renders it as tool
 * chips. Labels are Traveler-facing — raw tool names never reach the UI
 * (`name` stays in metadata for glyph mapping only).
 */
export const TOOL_STATUS_KEY = 'nomitoTools';

export type ToolStatusEntry = {
  callId: string;
  /** Raw tool name — metadata only, used to pick a chip glyph. Never rendered. */
  name?: string;
  label: string;
  done: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  search_listings: 'Buscando alojamientos',
  get_listing: 'Abriendo el detalle',
  quote_booking: 'Cotizando',
  book_listing: 'Reservando y pagando',
  cancel_booking: 'Cancelando la reserva',
  get_booking: 'Revisando tu reserva',
  list_bookings: 'Trayendo tus reservas',
  open_claim: 'Abriendo el reclamo',
  check_wallet: 'Revisando la wallet',
  check_balance: 'Revisando el saldo',
  pay_endpoint: 'Pagando',
};

export const GENERIC_TOOL_LABEL = 'Trabajando';

export function toolLabel(name: string | undefined): string {
  return (name && TOOL_LABELS[name]) || GENERIC_TOOL_LABEL;
}

/** Narrows the raw `metadata.custom[TOOL_STATUS_KEY]` value, defensively. */
export function readToolStatus(value: unknown): ToolStatusEntry[] {
  return Array.isArray(value) ? (value as ToolStatusEntry[]) : [];
}
