import type { ChatModelAdapter } from '@assistant-ui/react';

import {
  CASA_DE_ADOBE,
  findLodging,
  formatLocalPrice,
  isNorte,
  LODGINGS,
  quoteFor,
  type Lodging,
} from '@/lib/lodgings';
import { MONEDAS_SPENT_KEY, SEARCH_COST_MONEDAS } from '@/lib/nomito/tools';

/**
 * The ONLY place that knows Nomito's replies are fake. A real backend replaces
 * this adapter with one that streams the same shape: normal prose plus fenced
 * ```openui-lang programs that the OpenUI renderer turns into UI.
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

function shortlistFor(text: string): Lodging[] {
  const t = text.toLowerCase();
  // "Venimos desde Florianópolis… una semana en Salta": the Norte wins.
  const cities = NORTE_KEYWORDS.some((k) => t.includes(k)) ? null : placeIn(t);
  if (cities) return LODGINGS.filter((l) => cities.includes(l.city)).slice(0, 3);
  const norte = LODGINGS.filter(isNorte);
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

function quoteProgram(lodging: Lodging): string {
  const quote = quoteFor(lodging);
  const lines = quote.lines
    .map(
      (line) =>
        `{label: "${esc(line.label)}", value: "${esc(line.value)}"${line.kind ? `, kind: "${line.kind}"` : ''}}`,
    )
    .join(', ');
  return `root = Stack([quote])\nquote = QuoteCard("${esc(quote.lodging)} · ${quote.nights} noches", [${lines}], @ToAssistant("Sí, confirmo la reserva"))`;
}

function langBlock(program: string): string {
  return `\n\n\`\`\`openui-lang\n${program}\n\`\`\``;
}

type Plan = { text: string; monedasSpent?: number };

function plan(text: string, isFirstTurn: boolean): Plan {
  const t = text.toLowerCase();
  const mentionsTown = NORTE_KEYWORDS.some((x) => t.includes(x)) || placeIn(t) !== null;
  const wantsBooking = /reserv|confirm|elegir|quiero esa|quiero ese|me quedo/.test(t);

  if (wantsBooking) {
    const lodging = findLodging(text) ?? CASA_DE_ADOBE;
    return {
      text: `Buenísimo, ${lodging.name} en ${lodging.city}. Te armé el detalle en reales; el pago va directo al dueño y la comisión de conversión figura aparte.${langBlock(quoteProgram(lodging))}`,
    };
  }

  if (mentionsTown || /hostel|busc|alojamiento|semana|casa|cabaña|hospedaje|playa|viaj/.test(t)) {
    const options = shortlistFor(text);
    return {
      text: `Dale, me pongo a buscar. Miré precios y disponibilidad, y estas son las ${options.length} que mejor te quedan. Todas son directo con el dueño.${langBlock(shortlistProgram(options))}`,
      monedasSpent: SEARCH_COST_MONEDAS,
    };
  }

  return {
    text: isFirstTurn
      ? '¡Hola, Lucas! Contame un poco más: ¿a dónde te tienta ir, cuántas noches y cuántas personas van? Con eso te busco opciones.'
      : 'Tomé nota. ¿Te busco algo en el Norte argentino, Florianópolis, Cartagena, Tulum, Atacama o Colonia? Decime fechas y cuántos son.',
  };
}

export const mockAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const userText = lastUserText(messages);
    const isFirstTurn = messages.filter((m) => m.role === 'user').length <= 1;
    const { text, monedasSpent } = plan(userText, isFirstTurn);

    await sleep(500, abortSignal);

    let acc = '';
    for (const tok of tokens(text)) {
      if (abortSignal.aborted) return;
      acc += tok;
      yield { content: [{ type: 'text', text: acc }] };
      await sleep(TOKEN_DELAY_MS, abortSignal);
    }

    if (monedasSpent && !abortSignal.aborted) {
      yield {
        content: [{ type: 'text', text: acc }],
        metadata: { custom: { [MONEDAS_SPENT_KEY]: monedasSpent } },
      };
    }
  },
};
