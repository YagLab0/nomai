import { formatAmount, LODGINGS, NORTE_TOWNS, type Lodging } from '@/lib/lodgings';
import type { PhotoKey } from '@/lib/photos';

/**
 * Landing destinations: one per Ripio country, with the Argentine Norte (where
 * nomai was born) first and featured.
 */
export interface Destination {
  code: string;
  /** Tab label. */
  label: string;
  /** Card title. */
  name: string;
  country: string;
  tagline: string;
  photo: PhotoKey;
  towns: readonly string[];
  /** "desde $ 32.000 ARS", the cheapest night in the destination's currency. */
  from: string;
  /** Two Lodgings for the card grid, favourites first. */
  lodgings: Lodging[];
  featured?: boolean;
}

const BASE = [
  {
    code: 'NOA',
    label: 'Norte argentino',
    name: 'Norte argentino',
    country: 'Argentina · donde nacimos',
    photo: 'purmamarcaSieteColores',
    towns: NORTE_TOWNS,
    tagline: 'Quebradas, adobe y cerros de colores, de Salta a Humahuaca.',
    featured: true,
  },
  { code: 'FLN', label: 'Florianópolis', name: 'Florianópolis', country: 'Brasil', photo: 'floripaLagoinha', towns: ['Florianópolis'], tagline: 'Cuarenta playas en una isla, de mar abierto a laguna.' },
  { code: 'CTG', label: 'Cartagena', name: 'Cartagena', country: 'Colombia', photo: 'cartagenaReloj', towns: ['Cartagena'], tagline: 'Murallas, balcones de colores y el Caribe a la vuelta.' },
  { code: 'TUL', label: 'Tulum', name: 'Tulum', country: 'México', photo: 'tulumRuinas', towns: ['Tulum'], tagline: 'Ruinas mayas sobre el mar, cenotes y selva.' },
  { code: 'CJC', label: 'Atacama', name: 'San Pedro de Atacama', country: 'Chile', photo: 'atacamaValle', towns: ['San Pedro de Atacama'], tagline: 'Valle de la Luna, salares y el cielo más limpio del mundo.' },
  { code: 'CUZ', label: 'Cusco', name: 'Cusco', country: 'Perú', photo: 'cuscoMachuPicchu', towns: ['Cusco'], tagline: 'La capital inca y la puerta a Machu Picchu.' },
  { code: 'CYR', label: 'Colonia', name: 'Colonia del Sacramento', country: 'Uruguay', photo: 'coloniaFaro', towns: ['Colonia del Sacramento'], tagline: 'Calles de piedra, faro y atardeceres sobre el río.' },
] as const satisfies readonly Omit<Destination, 'from' | 'lodgings'>[];

export const DESTINATIONS: readonly Destination[] = BASE.map((d) => {
  const all = LODGINGS.filter((l) => (d.towns as readonly string[]).includes(l.city));
  const cheapest = all.reduce((a, b) => (b.pricePerNight < a.pricePerNight ? b : a));
  const lodgings = [...all.filter((l) => l.featured), ...all.filter((l) => !l.featured)].slice(0, 2);
  return { ...d, lodgings, from: `desde ${formatAmount(cheapest.pricePerNight, cheapest.currency)}` };
});
