import { formatShortDate } from '@/lib/format';
import type { Lodging } from '@/lib/lodgings';

/** Query param /app reads once to start a chat turn ("Pedirle a Nomito"). */
export const ASK_PARAM = 'ask';

/** A stay the Traveler picked on a Lodging's calendar; ISO dates. */
export interface Stay {
  checkIn: string;
  checkOut: string;
}

/** "Quiero reservar Casa de Adobe, Cafayate", plus ", del 20 nov al 23 nov" with dates. */
export function askMessage(l: Lodging, stay?: Stay): string {
  const base = `Quiero reservar ${l.name}, ${l.city}`;
  return stay ? `${base}, del ${formatShortDate(stay.checkIn)} al ${formatShortDate(stay.checkOut)}` : base;
}

export function askHrefInApp(l: Lodging): string {
  return `/app?${ASK_PARAM}=${encodeURIComponent(askMessage(l))}`;
}

/** Public surfaces go through sign-up, which carries the message into the chat. */
export function askHrefPublic(l: Lodging, stay?: Stay): string {
  return `/signup?${ASK_PARAM}=${encodeURIComponent(askMessage(l, stay))}`;
}
