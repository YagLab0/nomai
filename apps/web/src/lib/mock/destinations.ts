export interface Destination {
  code: string;
  name: string;
  tagline: string;
  nightlyARS: number;
  /** Sky, far hill, mid hill, near hill (CSS colors). */
  palette: [string, string, string, string];
  seed: number;
  stripes?: boolean;
}

/** Sample "desde" prices for the landing. */
export const DESTINATIONS: readonly Destination[] = [
  {
    code: 'SLA',
    name: 'Salta',
    tagline: 'La linda: casonas, peñas y cerros al fondo.',
    nightlyARS: 78_000,
    palette: ['var(--terra-soft)', 'var(--sand)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 1,
  },
  {
    code: 'CFY',
    name: 'Cafayate',
    tagline: 'Viñedos, bodegas y atardeceres colorados.',
    nightlyARS: 95_000,
    palette: ['var(--agua-soft)', 'var(--sand)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 2,
  },
  {
    code: 'PMA',
    name: 'Purmamarca',
    tagline: 'El cerro de los siete colores, desde tu ventana.',
    nightlyARS: 110_000,
    palette: ['var(--terra-soft)', 'var(--agua)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 3,
    stripes: true,
  },
  {
    code: 'TIL',
    name: 'Tilcara',
    tagline: 'Pucará, peñas y calles de tierra.',
    nightlyARS: 64_000,
    palette: ['var(--agua-soft)', 'var(--agua)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 4,
  },
  {
    code: 'HUM',
    name: 'Humahuaca',
    tagline: 'Carnaval, quebrada y cielo enorme.',
    nightlyARS: 58_000,
    palette: ['var(--sand)', 'var(--terra-soft)', 'var(--terra)', 'var(--terra-deep)'],
    seed: 5,
  },
];
