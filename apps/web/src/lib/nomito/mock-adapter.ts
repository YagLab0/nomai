import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';

import { CASA_DE_ADOBE, catalog } from '@/lib/catalog';
import { isNorte, quoteFor, type Lodging } from '@/lib/lodgings';
import {
  BOOKING_QUOTE_TOOL,
  MONEDAS_SPENT_KEY,
  SEARCH_COST_MONEDAS,
  SHORTLIST_TOOL,
} from '@/lib/nomito/tools';

/**
 * The ONLY place that knows Nomito's replies are fake. A real backend replaces
 * this adapter with one that streams the same text and emits the same
 * `shortlist` / `booking_quote` tool calls.
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
  { keywords: ['mendoza'], cities: ['Mendoza'] },
];

function placeIn(t: string): string[] | null {
  return PLACES.find((p) => p.keywords.some((k) => t.includes(k)))?.cities ?? null;
}

type Content = NonNullable<ChatModelRunResult['content']>;

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

function findLodging(text: string): Lodging | undefined {
  const t = text.toLowerCase();
  return catalog.all().find((l) => t.includes(l.name.toLowerCase()) || t.includes(l.id));
}

function shortlistFor(text: string): Lodging[] {
  const t = text.toLowerCase();
  // "Venimos desde Florianópolis… una semana en Salta": the Norte wins.
  const cities = NORTE_KEYWORDS.some((k) => t.includes(k)) ? null : placeIn(t);
  if (cities) return catalog.all().filter((l) => cities.includes(l.city)).slice(0, 3);
  const norte = catalog.all().filter(isNorte);
  if (t.includes('hostel')) return norte.filter((l) => l.kind === 'hostal' || l.city === 'Tilcara').slice(0, 3);
  const byTown = norte.filter((l) => t.includes(l.city.toLowerCase()));
  if (byTown.length >= 2) return byTown.slice(0, 3);
  return [...byTown, ...norte.filter((l) => !byTown.includes(l))].slice(0, 3);
}

function tokens(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

type Plan = { text: string; tool?: Content[number] };

function plan(text: string, isFirstTurn: boolean): Plan {
  const t = text.toLowerCase();
  const mentionsTown = NORTE_KEYWORDS.some((x) => t.includes(x)) || placeIn(t) !== null;
  const wantsBooking = /reserv|confirm|elegir|quiero esa|quiero ese|me quedo/.test(t);

  if (wantsBooking) {
    const lodging = findLodging(text) ?? CASA_DE_ADOBE;
    const quote = quoteFor(lodging);
    return {
      text: `Buenísimo, ${lodging.name} en ${lodging.city}. Te armé el detalle en reales; el pago va directo al dueño y la comisión de conversión figura aparte.`,
      tool: toolCall('quote', BOOKING_QUOTE_TOOL, quote),
    };
  }

  if (mentionsTown || /hostel|busc|alojamiento|semana|casa|cabaña|hospedaje|playa|viaj/.test(t)) {
    const options = shortlistFor(text);
    return {
      text: `Dale, me pongo a buscar. Miré precios y disponibilidad, y estas son las ${options.length} que mejor te quedan. Todas son directo con el dueño.`,
      tool: toolCall('list', SHORTLIST_TOOL, { options }),
    };
  }

  return {
    text: isFirstTurn
      ? '¡Hola, Lucas! Contame un poco más: ¿a dónde te tienta ir, cuántas noches y cuántas personas van? Con eso te busco opciones.'
      : 'Tomé nota. ¿Te busco algo en el Norte argentino, Florianópolis, Cartagena, Tulum, Atacama o Colonia? Decime fechas y cuántos son.',
  };
}

function toolCall(id: string, toolName: string, args: object): Content[number] {
  return {
    type: 'tool-call',
    toolCallId: `${id}-${Date.now()}`,
    toolName,
    args: args as never,
    argsText: JSON.stringify(args),
    // Already "answered": the UI is display-only, nothing waits on the model.
    result: { ok: true },
  };
}

export const mockAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const userText = lastUserText(messages);
    const isFirstTurn = messages.filter((m) => m.role === 'user').length <= 1;
    const { text, tool } = plan(userText, isFirstTurn);

    await sleep(500, abortSignal);

    let acc = '';
    for (const tok of tokens(text)) {
      if (abortSignal.aborted) return;
      acc += tok;
      yield { content: [{ type: 'text', text: acc }] };
      await sleep(TOKEN_DELAY_MS, abortSignal);
    }

    if (tool && !abortSignal.aborted) {
      await sleep(350, abortSignal);
      const isSearch = tool.type === 'tool-call' && tool.toolName === SHORTLIST_TOOL;
      yield {
        content: [{ type: 'text', text: acc }, tool],
        ...(isSearch && {
          metadata: { custom: { [MONEDAS_SPENT_KEY]: SEARCH_COST_MONEDAS } },
        }),
      };
    }
  },
};
