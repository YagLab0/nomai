import type { BookingQuote, Lodging } from '@/lib/lodgings';

/** Tool-call contract between Nomito (any backend) and the chat UI. */
export const SHORTLIST_TOOL = 'shortlist';
export const BOOKING_QUOTE_TOOL = 'booking_quote';

export interface ShortlistArgs {
  options: Lodging[];
}

export type BookingQuoteArgs = BookingQuote;

/** Metadata key carrying the monedas an assistant message actually spent. */
export const MONEDAS_SPENT_KEY = 'monedasSpent';
