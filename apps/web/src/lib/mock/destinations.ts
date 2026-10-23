import { lodgingsInTown } from '@/lib/lodgings';

export interface Destination {
  code: string;
  name: string;
  tagline: string;
  /** Cheapest Lodging in town, per night (ARS). Derived from the catalog. */
  fromARS: number;
  /** Sky, far hill, mid hill, near hill (CSS colors). */
  palette: [string, string, string, string];
  seed: number;
  stripes?: boolean;
}

/** Sample "desde" prices for the landing. */
const BASE: readonly Destination[] = [
  {
    code: 'SLA',
    name: 'Salta',
    tagline: 'La linda: casonas, peñas y cerros al fondo.',
    fromARS: 0,
    palette: ['var(--terra-soft)', 'var(--sand)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 1,
  },
  {
    code: 'CFY',
    name: 'Cafayate',
    tagline: 'Viñedos, bodegas y atardeceres colorados.',
    fromARS: 0,
    palette: ['var(--agua-soft)', 'var(--sand)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 2,
  },
  {
    code: 'PMA',
    name: 'Purmamarca',
    tagline: 'El cerro de los siete colores, desde tu ventana.',
    fromARS: 0,
    palette: ['var(--terra-soft)', 'var(--agua)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 3,
    stripes: true,
  },
  {
    code: 'TIL',
    name: 'Tilcara',
    tagline: 'Pucará, peñas y calles de tierra.',
    fromARS: 0,
    palette: ['var(--agua-soft)', 'var(--agua)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 4,
  },
  {
    code: 'HUM',
    name: 'Humahuaca',
    tagline: 'Carnaval, quebrada y cielo enorme.',
    fromARS: 0,
    palette: ['var(--sand)', 'var(--terra-soft)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 5,
  },
];

export const DESTINATIONS: readonly Destination[] = BASE.map((d) => ({
  ...d,
  fromARS: Math.min(...lodgingsInTown(d.name).map((l) => l.pricePerNight)),
}));
