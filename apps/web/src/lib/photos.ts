/**
 * Photography of the Argentine Norte (where nomai started) and of LATAM
 * destinations in Ripio countries, served from `public/images` through
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

  floripaLagoinha: photo('floripa-lagoinha-do-leste', 'La playa de Lagoinha do Leste entre cerros verdes, en Florianópolis', 937, 1250),
  floripaIngleses: photo('floripa-ingleses', 'Agua turquesa y gente bañándose en Praia dos Ingleses, Florianópolis', 1200, 1600),
  floripaBrava: photo('floripa-praia-brava', 'Praia Brava vista desde arriba, con casas frente al mar, en Florianópolis', 1600, 1200),
  tulumRuinas: photo('tulum-ruinas', 'Las ruinas mayas de Tulum sobre el acantilado y el mar Caribe', 1600, 1066),
  tulumPalapa: photo('tulum-palapa', 'Techo de palma frente a la playa entre palmeras, en Tulum', 1067, 1600),
  tulumBici: photo('tulum-bici', 'Una bicicleta blanca bajo el cartel Follow that dream, en Tulum', 867, 1300),
  cartagenaReloj: photo('cartagena-torre-reloj', 'La Torre del Reloj y la plaza, en Cartagena', 1600, 1200),
  cartagenaCasas: photo('cartagena-casas', 'Casas coloniales de colores con flores en los balcones, en Cartagena', 1600, 1124),
  cartagenaBalcon: photo('cartagena-balcon', 'Balcón de madera pintado de colores en Getsemaní, Cartagena', 1067, 1600),
  atacamaValle: photo('atacama-valle-de-la-luna', 'Las crestas del Valle de la Luna, en San Pedro de Atacama', 1183, 1600),
  atacamaLejia: photo('atacama-laguna-lejia', 'Volcanes reflejados en la Laguna Lejía, cerca de San Pedro de Atacama', 1600, 1200),
  atacamaBaltinache: photo('atacama-baltinache', 'Laguna turquesa sobre la sal en Baltinache, San Pedro de Atacama', 1600, 1066),
  cuscoMachuPicchu: { src: '/images/cusco-machu-picchu.jpg', alt: 'Machu Picchu al amanecer, cerca de Cusco', width: 1600, height: 1067 },
  coloniaFaro: photo('colonia-faro', 'El faro de Colonia del Sacramento entre árboles', 1600, 1062),
  coloniaPortal: photo('colonia-portal', 'Puerta antigua con una santa rita en flor, en Colonia del Sacramento', 1600, 865),
  coloniaCafe: photo('colonia-cafe', 'Un café bajo un árbol con un auto antiguo, en Colonia del Sacramento', 1067, 1600),
} as const;

export type PhotoKey = keyof typeof PHOTOS;
