import type { BookingQuote, Lodging } from '@/lib/mock/lodgings';

/** Tool-call contract between Nomito (any backend) and the chat UI. */
export const SHORTLIST_TOOL = 'shortlist';
export const BOOKING_QUOTE_TOOL = 'booking_quote';

export interface ShortlistArgs {
  options: Lodging[];
}

export type BookingQuoteArgs = BookingQuote;

/** Metadata key on an assistant message that ran a search. */
export const MONEDAS_SPENT_KEY = 'monedasSpent';
export const SEARCH_COST_MONEDAS = 3;
