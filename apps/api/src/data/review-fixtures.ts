import { LISTINGS, PROPERTIES } from "./inventory.js";

/**
 * Review fixtures (ADR-0008): completed Bookings in the past + the Traveler's
 * to_lodging Review on each, so the weighted aggregates compute for real and
 * the cards/detail stop showing seed numbers. The Traveler is synthetic —
 * bookings.traveler_id and reviews.author_id stay null; author_name carries
 * the public copy. total_minor is the rental amount BEFORE the
 * apply_service_fee trigger adds the Service fee (same contract as
 * book_stay). refresh_review_scores recomputes the cached pairs at the end.
 *
 * Used by scripts/gen-seed.ts (→ supabase/seed.sql) and by
 * scripts/apply-seed-reviews.mjs (→ the linked DB over PostgREST).
 */
export type ReviewFixture = {
  booking: string;
  listing: string;
  checkin: string;
  checkout: string;
  guests: number;
  total_minor: number;
  currency: string;
  author: string;
  created: string;
  rating: number;
  scores: {
    cleanliness?: number;
    accuracy?: number;
    checkin?: number;
    communication?: number;
    location?: number;
    value?: number;
  };
  body: string;
  reply?: string;
};

export const REVIEW_FIXTURES: ReviewFixture[] = [
  {
    booking: "bkg_seed_adobe_1", listing: "lst_casa_de_adobe",
    checkin: "2026-10-10", checkout: "2026-10-13", guests: 2,
    total_minor: 300_000_000_000, currency: "ARS",
    author: "Sofía", created: "2026-10-15T19:20:00-03:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 5, communication: 5, location: 5, value: 5 },
    body: "La casa es igualita a las fotos: el patio con la parral es un sueño y la vajilla de barro, un detalle precioso. Ramón nos esperó con la estufa prendida y una lista de bodegas. Volveríamos sin pensarlo.",
    reply: "¡Gracias Sofía! Los esperamos para la vendimia, el patio pide vino de por medio.",
  },
  {
    booking: "bkg_seed_adobe_2", listing: "lst_casa_de_adobe",
    checkin: "2026-08-21", checkout: "2026-08-24", guests: 3,
    total_minor: 300_000_000_000, currency: "ARS",
    author: "Diego", created: "2026-08-25T11:05:00-03:00", rating: 4,
    scores: { cleanliness: 4, accuracy: 4, checkin: 5, communication: 5, location: 5, value: 4 },
    body: "Ubicación perfecta, a dos cuadras de la plaza. La casa está impecable y el check-in fue rapidísimo. Único detalle: el wifi anduvo flojo a la noche.",
  },
  {
    booking: "bkg_seed_adobe_3", listing: "lst_casa_de_adobe",
    checkin: "2026-06-12", checkout: "2026-06-15", guests: 2,
    total_minor: 300_000_000_000, currency: "ARS",
    author: "Martina", created: "2026-06-17T09:40:00-03:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 4, communication: 5, location: 5, value: 5 },
    body: "Hermosa estadía. El parrilla y el patio son para quedarse a vivir, y Cafayate en invierno es otra cosa. Súper recomendable.",
  },
  {
    booking: "bkg_seed_adobe_4", listing: "lst_casa_de_adobe",
    checkin: "2026-02-20", checkout: "2026-02-23", guests: 4,
    total_minor: 300_000_000_000, currency: "ARS",
    author: "Camila", created: "2026-02-25T14:00:00-03:00", rating: 4,
    scores: { cleanliness: 4, accuracy: 4, checkin: 4, communication: 4, location: 5, value: 4 },
    body: "Todo correcto y el lugar es precioso. El colchón del cuarto principal algo blando para mi gusto, pero la experiencia general muy buena.",
  },
  {
    booking: "bkg_seed_algarrobo_1", listing: "lst_posada_el_algarrobo",
    checkin: "2026-09-18", checkout: "2026-09-21", guests: 2,
    total_minor: 234_000_000_000, currency: "ARS",
    author: "Lucas", created: "2026-09-22T10:15:00-03:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 5, communication: 5, location: 4, value: 5 },
    body: "Desayuno casero de otra época y una atención que no se ve seguido. Graciela nos ayudó con los paseos a Cafayate y Purmamarca. Volvería seguro.",
  },
  {
    booking: "bkg_seed_algarrobo_2", listing: "lst_posada_el_algarrobo",
    checkin: "2026-07-04", checkout: "2026-07-07", guests: 2,
    total_minor: 234_000_000_000, currency: "ARS",
    author: "Julián", created: "2026-07-08T16:30:00-03:00", rating: 4,
    scores: { cleanliness: 4, accuracy: 4, checkin: 5, communication: 5, location: 4, value: 4 },
    body: "Posada cálida en pleno invierno, la estufa a leña se agradece. A pie del centro pero con algo de subida; lo que pierde en ubicación lo gana en tranquilidad.",
  },
  {
    booking: "bkg_seed_algarrobo_3", listing: "lst_posada_el_algarrobo",
    checkin: "2026-04-11", checkout: "2026-04-13", guests: 1,
    total_minor: 156_000_000_000, currency: "ARS",
    author: "Valeria", created: "2026-04-14T08:50:00-03:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 5, communication: 5, location: 4, value: 5 },
    body: "Escapada corta y perfecta. Silencio total a la noche y un pan casero que vale el viaje.",
  },
  {
    booking: "bkg_seed_colores_1", listing: "lst_cabanas_siete_colores",
    checkin: "2026-10-02", checkout: "2026-10-05", guests: 2,
    total_minor: 342_000_000_000, currency: "ARS",
    author: "Bruno", created: "2026-10-06T20:10:00-03:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 5, communication: 5, location: 5, value: 5 },
    body: "Despertarse mirando el Cerro de los Siete Colores no tiene precio. La cabaña impecable, la calefacción a leña un golazo y Lidia siempre a un mensaje de distancia.",
    reply: "¡Gracias Bruno! Nos encanta recibir viajeros que aprovechan la quebrada. Cuando quieran volver, acá estamos.",
  },
  {
    booking: "bkg_seed_colores_2", listing: "lst_cabanas_siete_colores",
    checkin: "2026-08-08", checkout: "2026-08-11", guests: 3,
    total_minor: 342_000_000_000, currency: "ARS",
    author: "Antonella", created: "2026-08-12T12:45:00-03:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 5, communication: 4, location: 5, value: 5 },
    body: "La vista es exactamente la de las fotos, algo raro de encontrar. Cabaña cómoda y muy limpia. El Paseo de los Colorados a diez minutos caminando.",
  },
  {
    booking: "bkg_seed_colores_3", listing: "lst_cabanas_siete_colores",
    checkin: "2026-05-16", checkout: "2026-05-19", guests: 2,
    total_minor: 342_000_000_000, currency: "ARS",
    author: "Federico", created: "2026-05-20T09:00:00-03:00", rating: 4,
    scores: { cleanliness: 4, accuracy: 4, checkin: 4, communication: 5, location: 5, value: 4 },
    body: "Muy buena cabaña y ubicación inmejorable. Le faltaría algo de vajilla extra si van más de dos personas, pero la vista lo compensa todo.",
  },
  {
    booking: "bkg_seed_marina_1", listing: "lst_posada_marina",
    checkin: "2026-09-25", checkout: "2026-09-28", guests: 2,
    total_minor: 720_000_000, currency: "BRL",
    author: "Thiago", created: "2026-09-29T13:20:00-03:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 5, communication: 5, location: 5, value: 4 },
    body: "Pousada a dois quarteirões da praia do Campeche, café da manhã excelente e a Marina sempre disponível. Quarto limpíssimo, cama confortável. Voltaremos no verão.",
  },
  {
    booking: "bkg_seed_marina_2", listing: "lst_posada_marina",
    checkin: "2026-06-19", checkout: "2026-06-22", guests: 2,
    total_minor: 720_000_000, currency: "BRL",
    author: "Renata", created: "2026-06-23T15:35:00-03:00", rating: 4,
    scores: { cleanliness: 4, accuracy: 4, checkin: 4, communication: 5, location: 5, value: 4 },
    body: "Posada a pasos del Campeche, atención de Marina impecable y desayuno riquísimo. La habitación algo chica para una estadía larga, pero para un finde va perfecto.",
  },
  {
    booking: "bkg_seed_getsemani_1", listing: "lst_casa_getsemani",
    checkin: "2026-10-16", checkout: "2026-10-19", guests: 4,
    total_minor: 1_140_000_000_000, currency: "COP",
    author: "Andrés", created: "2026-10-20T18:00:00-05:00", rating: 5,
    scores: { cleanliness: 5, accuracy: 5, checkin: 5, communication: 5, location: 5, value: 5 },
    body: "Getsemaní es el barrio para quedarse en Cartagena y esta casa lo demuestra: patio interno, ventiladores en todos lados y la Plaza de la Trinidad a la vuelta. Valentina resolvió todo por WhatsApp en minutos.",
  },
  {
    booking: "bkg_seed_getsemani_2", listing: "lst_casa_getsemani",
    checkin: "2026-07-24", checkout: "2026-07-27", guests: 3,
    total_minor: 1_140_000_000_000, currency: "COP",
    author: "Paulina", created: "2026-07-28T10:25:00-05:00", rating: 4,
    scores: { cleanliness: 4, accuracy: 4, checkin: 5, communication: 5, location: 5, value: 4 },
    body: "Casa con mucho carácter en el mejor barrio de la ciudad. Aviso para sonos livianos: el fin de semana se escucha la movida de la Trinidad; para nosotros fue parte del encanto.",
  },
];

/** listing_id → business_id, for the refresh_review_scores calls. */
export const REVIEW_BUSINESS: Record<string, string> = Object.fromEntries(
  REVIEW_FIXTURES.map((r) => {
    const l = LISTINGS.find((x) => x.id === r.listing)!;
    const p = PROPERTIES.find((x) => x.id === l.property_id)!;
    return [r.listing, p.business_id];
  })
);
