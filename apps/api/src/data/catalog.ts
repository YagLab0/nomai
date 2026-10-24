import type { Amenity, CancellationPolicy } from "./types.js";

// Canonical amenity catalog — `code` is the filterable key used by
// /listings/search and the agent's search_listings tool.
export const AMENITIES: Amenity[] = [
  { id: "amn_wifi", code: "wifi", name: "WiFi", category: "general" },
  {
    id: "amn_wifi_rapido",
    code: "wifi_rapido",
    name: "WiFi de alta velocidad",
    category: "general",
  },
  {
    id: "amn_workspace",
    code: "workspace",
    name: "Espacio de trabajo",
    category: "general",
  },
  {
    id: "amn_aire",
    code: "aire_acondicionado",
    name: "Aire acondicionado",
    category: "general",
  },
  {
    id: "amn_calefaccion",
    code: "calefaccion",
    name: "Calefacción",
    category: "general",
  },
  { id: "amn_tv", code: "tv", name: "TV", category: "general" },
  {
    id: "amn_desayuno",
    code: "desayuno",
    name: "Desayuno incluido",
    category: "servicios",
  },
  {
    id: "amn_recepcion",
    code: "recepcion_24h",
    name: "Recepción 24h",
    category: "servicios",
  },
  {
    id: "amn_lavanderia",
    code: "lavanderia",
    name: "Lavandería",
    category: "servicios",
  },
  {
    id: "amn_cocina",
    code: "cocina",
    name: "Cocina equipada",
    category: "cocina",
  },
  {
    id: "amn_nevera",
    code: "nevera",
    name: "Nevera",
    category: "cocina",
  },
  {
    id: "amn_microondas",
    code: "microondas",
    name: "Microondas",
    category: "cocina",
  },
  { id: "amn_cafe", code: "cafetera", name: "Cafetera", category: "cocina" },
  {
    id: "amn_bano_priv",
    code: "bano_privado",
    name: "Baño privado",
    category: "bano",
  },
  { id: "amn_jacuzzi", code: "jacuzzi", name: "Jacuzzi", category: "bano" },
  { id: "amn_piscina", code: "piscina", name: "Piscina", category: "exterior" },
  {
    id: "amn_parrilla",
    code: "parrilla",
    name: "Parrilla / BBQ",
    category: "exterior",
  },
  {
    id: "amn_terraza",
    code: "terraza",
    name: "Terraza / balcón",
    category: "exterior",
  },
  { id: "amn_jardin", code: "jardin", name: "Jardín", category: "exterior" },
  {
    id: "amn_estacionamiento",
    code: "estacionamiento",
    name: "Estacionamiento",
    category: "exterior",
  },
  {
    id: "amn_seguridad",
    code: "seguridad_24h",
    name: "Seguridad 24h",
    category: "seguridad",
  },
  {
    id: "amn_detector",
    code: "detector_humo",
    name: "Detector de humo",
    category: "seguridad",
  },
  {
    id: "amn_extintor",
    code: "extintor",
    name: "Extintor",
    category: "seguridad",
  },
  {
    id: "amn_accesible",
    code: "accesible_silla",
    name: "Accesible en silla de ruedas",
    category: "accesibilidad",
  },
];

export const AMENITY_BY_CODE = new Map(AMENITIES.map((a) => [a.code, a]));
export const AMENITY_BY_ID = new Map(AMENITIES.map((a) => [a.id, a]));

// Cancellation policies. business_id null = platform default.
export const CANCELLATION_POLICIES: CancellationPolicy[] = [
  {
    id: "cpol_flex",
    business_id: null,
    name: "Flexible",
    full_refund_days: 1,
    partial_refund_pct: 0,
    partial_refund_days: 0,
  },
  {
    id: "cpol_moderada",
    business_id: null,
    name: "Moderada",
    full_refund_days: 5,
    partial_refund_pct: 50,
    partial_refund_days: 1,
  },
  {
    id: "cpol_estricta",
    business_id: null,
    name: "Estricta",
    full_refund_days: 14,
    partial_refund_pct: 50,
    partial_refund_days: 7,
  },
  {
    id: "cpol_larga_estadia",
    business_id: null,
    name: "Larga estadía",
    full_refund_days: 30,
    partial_refund_pct: 50,
    partial_refund_days: 14,
  },
];
