import type { ChatModelAdapter } from '@assistant-ui/react';

import {
  formatAmount,
  formatLocalPrice,
  isNorte,
  type Lodging,
} from '@/lib/lodgings';
import { apiCardToLodging } from '@/lib/api-mapping';
import type { ApiListingCard, ApiQuote } from '@/lib/api';
import { creditFailureMessage, spendCredits } from '@/lib/nomito/credits';
import { MONEDAS_SPENT_KEY } from '@/lib/nomito/tools';

/**
 * Mock Nomito chat adapter: streams responses with OpenUI Lang programs.
 * Calls real `/api/listings` and `/api/listings/:slug/quote` endpoints.
 *
 * Credits (issue #17): every turn posts a `conversation` spend, and a turn
 * that touches real /listings data posts `live_query` BEFORE the fetch — the
 * ADR-0002 ceilings are meant to gate the query, not to bill it after the
 * fact. A 402/429 refusal ends the run with a `credits:*` error the message
 * UI translates.
 */

const TOKEN_DELAY_MS = 28;

const NORTE_KEYWORDS = ['salta', 'cafayate', 'purmamarca', 'tilcara', 'humahuaca', 'jujuy', 'norte', 'quebrada'];

/** Places outside the Norte, by what a Traveler might type → catalog cities. */
const PLACES: { keywords: string[]; cities: string[] }[] = [
  { keywords: ['floripa', 'florianópolis', 'florianopolis', 'brasil', 'brazil'], cities: ['Florianópolis'] },
  { keywords: ['cartagena', 'caribe colombiano'], cities: ['Cartagena'] },
  { keywords: ['bogotá', 'bogota'], cities: ['Bogotá'] },
  { keywords: ['colombia'], cities: ['Cartagena', 'Bogotá'] },
  { keywords: ['tulum', 'riviera maya', 'cenote', 'méxico', 'mexico'], cities: ['Tulum'] },
  { keywords: ['atacama', 'san pedro', 'chile'], cities: ['San Pedro de Atacama'] },
  { keywords: ['colonia', 'uruguay'], cities: ['Colonia del Sacramento'] },
  { keywords: ['cusco', 'cuzco', 'perú', 'peru', 'machu picchu', 'machu pichu'], cities: ['Cusco'] },
  { keywords: ['mendoza'], cities: ['Mendoza'] },
];

function placeIn(t: string): string[] | null {
  return PLACES.find((p) => p.keywords.some((k) => t.includes(k)))?.cities ?? null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

function lastUserText(messages: Parameters<ChatModelAdapter['run']>[0]['messages']): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    return m.content.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
  }
  return '';
}

async function fetchCatalog(): Promise<Lodging[]> {
  try {
    const res = await fetch('/api/listings');
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: ApiListingCard[] };
    return (body?.results ?? []).map(apiCardToLodging);
  } catch {
    return [];
  }
}

async function fetchQuoteApi(slug: string, checkin: string, checkout: string, guests = 2): Promise<ApiQuote | null> {
  try {
    const qs = new URLSearchParams({ checkin, checkout, guests: String(guests) });
    const res = await fetch(`/api/listings/${encodeURIComponent(slug)}/quote?${qs.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as ApiQuote;
  } catch {
    return null;
  }
}

function shortlistFor(text: string, inventory: Lodging[]): Lodging[] {
  const t = text.toLowerCase();
  // "Venimos desde Florianópolis… una semana en Salta": the Norte wins.
  const cities = NORTE_KEYWORDS.some((k) => t.includes(k)) ? null : placeIn(t);
  if (cities) return inventory.filter((l) => cities.includes(l.city)).slice(0, 3);
  const norte = inventory.filter(isNorte);
  if (t.includes('hostel')) return norte.filter((l) => l.kind === 'hostal' || l.city === 'Tilcara').slice(0, 3);
  const byTown = norte.filter((l) => t.includes(l.city.toLowerCase()));
  if (byTown.length >= 2) return byTown.slice(0, 3);
  return [...byTown, ...norte.filter((l) => !byTown.includes(l))].slice(0, 3);
}

function tokens(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/** Escape a string for a double-quoted openui-lang literal. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * OpenUI Lang programs — the same wire format the real Agent emits (see
 * apps/web/src/lib/openui/library.tsx for the catalog these calls target).
 */
function shortlistProgram(options: Lodging[]): string {
  const refs = options.map((_, i) => `c${i}`).join(', ');
  const cards = options
    .map(
      (l, i) =>
        `c${i} = ListingCard("${esc(l.name)}", "${esc(l.city)}", "${esc(formatLocalPrice(l))} / noche", "directo con el dueño", @ToAssistant("Quiero reservar ${esc(l.name)}, ${esc(l.city)}"), "${esc(l.blurb)}", "${esc(l.code)}")`,
    )
    .join('\n');
  return `root = Stack([${refs}])\n${cards}`;
}

function quoteProgram(lodging: Lodging, quote: ApiQuote | null, nights = 3): string {
  if (quote) {
    const lines = [
      `{label: "Reserva: ${esc(lodging.name)}, ${esc(lodging.city)} · ${quote.nights_count} noches", value: "${esc(quote.nights_display)}"}`,
      ...(quote.cleaning_minor > 0
        ? [`{label: "Limpieza", value: "${esc(quote.cleaning_display)}"}`]
        : []),
      `{label: "Total", value: "${esc(quote.total_display)}", kind: "total"}`,
    ].join(', ');
    return `root = Stack([quote])\nquote = QuoteCard("${esc(lodging.name)} · ${quote.nights_count} noches", [${lines}], @ToAssistant("Sí, confirmo la reserva"))`;
  }

  const totalLocal = lodging.pricePerNight * nights;
  const lines = [
    `{label: "Reserva: ${esc(lodging.name)}, ${esc(lodging.city)} · ${nights} noches", value: "${esc(formatAmount(totalLocal, lodging.currency))}"}`,
    `{label: "Total", value: "${esc(formatAmount(totalLocal, lodging.currency))}", kind: "total"}`,
  ].join(', ');
  return `root = Stack([quote])\nquote = QuoteCard("${esc(lodging.name)} · ${nights} noches", [${lines}], @ToAssistant("Sí, confirmo la reserva"))`;
}

function langBlock(program: string): string {
  return `\n\n\`\`\`openui-lang\n${program}\n\`\`\``;
}

/**
 * Does this turn need real /listings data (a live_query spend) or is it just
 * conversation? The fetch stays inside plan() — this predicate is the
 * pre-flight check that gates the charge before any catalog call.
 */
function needsLiveQuery(t: string): boolean {
  const wantsBooking = /reserv|confirm|elegir|quiero esa|quiero ese|me quedo/.test(t);
  const wantsSearch =
    NORTE_KEYWORDS.some((x) => t.includes(x)) ||
    placeIn(t) !== null ||
    /hostel|busc|alojamiento|semana|casa|cabaña|hospedaje|playa|viaj/.test(t);
  return wantsBooking || wantsSearch;
}

async function plan(text: string, isFirstTurn: boolean): Promise<string> {
  const t = text.toLowerCase();

  if (!needsLiveQuery(t)) {
    return isFirstTurn
      ? '¡Hola, Lucas! Contame un poco más: ¿a dónde te tienta ir, cuántas noches y cuántas personas van? Con eso te busco opciones.'
      : 'Tomé nota. ¿Te busco algo en el Norte argentino, Florianópolis, Cartagena, Tulum, Atacama o Colonia? Decime fechas y cuántos son.';
  }

  const inventory = await fetchCatalog();

  if (/reserv|confirm|elegir|quiero esa|quiero ese|me quedo/.test(t)) {
    const lodging = inventory.find((l) => t.includes(l.name.toLowerCase()) || t.includes(l.id)) ?? inventory[0];
    if (lodging) {
      // Default to stay starting 7 days ahead for 3 nights
      const inDate = new Date();
      inDate.setDate(inDate.getDate() + 7);
      const outDate = new Date(inDate);
      outDate.setDate(outDate.getDate() + 3);
      const checkin = inDate.toISOString().slice(0, 10);
      const checkout = outDate.toISOString().slice(0, 10);

      const quote = await fetchQuoteApi(lodging.id, checkin, checkout, lodging.guests || 2);
      return `Buenísimo, ${lodging.name} en ${lodging.city}. Te armé el detalle; el pago va directo al dueño y la comisión de conversión figura aparte.${langBlock(quoteProgram(lodging, quote, 3))}`;
    }
  }

  const options = shortlistFor(text, inventory);
  return `Dale, me pongo a buscar. Miré precios y disponibilidad, y estas son las ${options.length} que mejor te quedan. Todas son directo con el dueño.${langBlock(shortlistProgram(options))}`;
}

/** End the run with a credits error the message UI translates. */
function refused(code: 'no-credits' | 'daily-cap', spent: number) {
  return {
    status: {
      type: 'incomplete',
      reason: 'error',
      error: creditFailureMessage(code),
    },
    ...(spent > 0 ? { metadata: { custom: { [MONEDAS_SPENT_KEY]: spent } } } : {}),
  } as const;
}

export const mockAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const userText = lastUserText(messages);
    const isFirstTurn = messages.filter((m) => m.role === 'user').length <= 1;
    let spent = 0;

    // Conversation cover — same contract as eveAdapter.
    const cover = await spendCredits('conversation');
    if (cover.ok) {
      spent += cover.amount;
    } else if (cover.code === 'no-credits' || cover.code === 'daily-cap') {
      yield refused(cover.code, spent);
      return;
    }

    // Live stage paid before touching /listings (ADR-0002).
    if (needsLiveQuery(userText.toLowerCase())) {
      const live = await spendCredits('live_query', { adapter: 'mock' });
      if (live.ok) {
        spent += live.amount;
      } else if (live.code === 'no-credits' || live.code === 'daily-cap') {
        yield refused(live.code, spent);
        return;
      }
    }

    const text = await plan(userText, isFirstTurn);

    await sleep(500, abortSignal);

    let acc = '';
    for (const tok of tokens(text)) {
      if (abortSignal.aborted) return;
      acc += tok;
      yield { content: [{ type: 'text', text: acc }] };
      await sleep(TOKEN_DELAY_MS, abortSignal);
    }

    if (spent > 0 && !abortSignal.aborted) {
      yield {
        content: [{ type: 'text', text: acc }],
        metadata: { custom: { [MONEDAS_SPENT_KEY]: spent } },
      };
    }
  },
};
