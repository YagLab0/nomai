import type { Lodging } from '@/lib/lodgings';

/** Query param /app reads once to start a chat turn ("Pedirle a Nomito"). */
export const ASK_PARAM = 'ask';

export function askMessage(l: Lodging): string {
  return `Quiero reservar ${l.name}, ${l.city}`;
}

export function askHrefInApp(l: Lodging): string {
  return `/app?${ASK_PARAM}=${encodeURIComponent(askMessage(l))}`;
}
