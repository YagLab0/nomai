/**
 * Photography of the Argentine Norte, served from `public/images` through
 * next/image. Credits and sources: `public/images/CREDITS.md`.
 */

export interface Photo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

const photo = (file: string, alt: string, width: number, height: number): Photo => ({
  src: `/images/${file}.webp`,
  alt,
  width,
  height,
});

export const PHOTOS = {
  purmamarcaSieteColores: photo('purmamarca-siete-colores', 'Las franjas de colores del Cerro de los Siete Colores, en Purmamarca', 1600, 1066),
  purmamarcaAdobe: photo('purmamarca-adobe', 'Casas de adobe al pie de un cerro rojo en Purmamarca', 1280, 960),
  purmamarcaFeria: photo('purmamarca-feria', 'Puestos de tejidos en una calle de Purmamarca', 1600, 1066),
  salinasGrandes: photo('salinas-grandes', 'Piletones de agua sobre la sal blanca de Salinas Grandes', 1600, 1179),
  tilcaraPucara: photo('tilcara-pucara', 'Cardones y el monumento del Pucará de Tilcara', 1360, 877),
  tilcaraPatio: photo('tilcara-patio', 'Patio con mesas y paredes rosadas en Tilcara', 1600, 1200),
  tilcaraRuinas: photo('tilcara-pucara-ruinas', 'Muros de piedra del Pucará de Tilcara', 1600, 1066),
  humahuacaHornocal: photo('humahuaca-hornocal', 'La Serranía de Hornocal desde el mirador, cerca de Humahuaca', 1600, 1200),
  humahuacaCerros: photo('humahuaca-cerros', 'Cerros de franjas de colores bajo las nubes, en Humahuaca', 1600, 1066),
  humahuacaValle: photo('humahuaca-valle', 'Humahuaca y su valle, con los cerros al fondo', 1600, 1066),
  cafayateVinedos: photo('cafayate-vinedos', 'Viñedos de Cafayate con los cerros de fondo', 1600, 1066),
  quebradaConchas: photo('quebrada-de-las-conchas', 'Ruta entre las formaciones rojas de la Quebrada de las Conchas', 1280, 1600),
  cafayateHabitacion: photo('cafayate-habitacion', 'Habitación con cama de hierro y veladores en Cafayate', 1600, 778),
  saltaSanFrancisco: photo('salta-san-francisco', 'Fachada de la Basílica de San Francisco, en Salta', 1067, 1600),
  saltaCatedral: photo('salta-catedral', 'Fachada de la Catedral Basílica de Salta', 933, 1400),
  saltaTeleferico: photo('salta-teleferico', 'Salta vista desde el teleférico al cerro San Bernardo', 1600, 1066),
} as const;

export type PhotoKey = keyof typeof PHOTOS;
