import { formatARS, formatBRL } from '@/lib/format';

/** Mock catalog + quote maths. Replaced by the real search/quote backend later. */

export const ARS_PER_BRL = 195;
const FX_FEE_RATE = 0.01;
export const NIGHTS = 3;

export interface Lodging {
  id: string;
  name: string;
  town: 'Salta' | 'Cafayate' | 'Purmamarca' | 'Tilcara';
  /** Short ticket code, e.g. CFY */
  code: string;
  nightlyARS: number;
  blurb: string;
  /** Pinned figures so the headline scenario matches the spec exactly. */
  pinned?: { subtotalBRL: number; feeBRL: number };
}

export const LODGINGS: readonly Lodging[] = [
  {
    id: 'casa-de-adobe',
    name: 'Casa de Adobe',
    town: 'Cafayate',
    code: 'CFY',
    nightlyARS: 95_000,
    blurb: 'Patio con parral, a dos cuadras de la plaza.',
    pinned: { subtotalBRL: 1461.55, feeBRL: 14.6 },
  },
  {
    id: 'posada-el-algarrobo',
    name: 'Posada El Algarrobo',
    town: 'Salta',
    code: 'SLA',
    nightlyARS: 78_000,
    blurb: 'Casona de barrio, desayuno casero incluido.',
  },
  {
    id: 'cabanas-siete-colores',
    name: 'Cabañas Siete Colores',
    town: 'Purmamarca',
    code: 'PMA',
    nightlyARS: 110_000,
    blurb: 'Cabañas frente al Cerro de los Siete Colores.',
  },
  {
    id: 'hostel-la-quebrada',
    name: 'Hostel La Quebrada',
    town: 'Tilcara',
    code: 'TIL',
    nightlyARS: 32_000,
    blurb: 'Habitación doble privada, cocina compartida.',
  },
];

export function nightlyBRL(l: Lodging): number {
  return Math.round(l.nightlyARS / ARS_PER_BRL);
}

export function findLodging(text: string): Lodging | undefined {
  const t = text.toLowerCase();
  return LODGINGS.find((l) => t.includes(l.name.toLowerCase()) || t.includes(l.id));
}

export interface QuoteLine {
  label: string;
  value: string;
  kind?: 'fee' | 'total';
}

export interface BookingQuote {
  lodging: string;
  town: string;
  nights: number;
  lines: QuoteLine[];
}

export function quoteFor(l: Lodging, nights = NIGHTS): BookingQuote {
  const totalARS = l.nightlyARS * nights;
  const subtotal = l.pinned?.subtotalBRL ?? Math.round((totalARS / ARS_PER_BRL) * 100) / 100;
  const fee = l.pinned?.feeBRL ?? Math.round(subtotal * FX_FEE_RATE * 100) / 100;
  const total = Math.round((subtotal + fee) * 100) / 100;
  return {
    lodging: l.name,
    town: l.town,
    nights,
    lines: [
      { label: `Reserva: ${l.name}, ${l.town} · ${nights} noches`, value: formatARS(totalARS) },
      { label: `Conversión BRL → ARS · 1 BRL = ${ARS_PER_BRL} ARS`, value: formatBRL(subtotal) },
      { label: 'Comisión de conversión Nomai', value: formatBRL(fee), kind: 'fee' },
      { label: 'Total', value: formatBRL(total, { withCode: true }), kind: 'total' },
    ],
  };
}
