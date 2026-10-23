import { lodgingsInTown, type Lodging } from '@/lib/lodgings';
import type { PhotoKey } from '@/lib/photos';

export interface Destination {
  code: string;
  name: string;
  province: 'Salta' | 'Jujuy';
  tagline: string;
  photo: PhotoKey;
  /** Cheapest Lodging in town, per night (ARS). Derived from the catalog. */
  fromARS: number;
  lodgings: Lodging[];
}

const BASE = [
  { code: 'SLA', name: 'Salta', province: 'Salta', photo: 'saltaSanFrancisco', tagline: 'La linda: casonas, peñas y cerros al fondo.' },
  { code: 'CFY', name: 'Cafayate', province: 'Salta', photo: 'quebradaConchas', tagline: 'Viñedos, bodegas y la Quebrada de las Conchas.' },
  { code: 'PMA', name: 'Purmamarca', province: 'Jujuy', photo: 'purmamarcaSieteColores', tagline: 'El cerro de los siete colores, desde tu ventana.' },
  { code: 'TIL', name: 'Tilcara', province: 'Jujuy', photo: 'tilcaraPucara', tagline: 'Pucará, peñas y calles de tierra.' },
  { code: 'HUM', name: 'Humahuaca', province: 'Jujuy', photo: 'humahuacaHornocal', tagline: 'Carnaval, el Hornocal y un cielo enorme.' },
] as const satisfies readonly Omit<Destination, 'fromARS' | 'lodgings'>[];

/** The five launch towns, each with its Lodgings from the catalog. */
export const DESTINATIONS: readonly Destination[] = BASE.map((d) => {
  const lodgings = lodgingsInTown(d.name);
  return { ...d, lodgings, fromARS: Math.min(...lodgings.map((l) => l.pricePerNight)) };
});
