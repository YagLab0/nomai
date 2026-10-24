import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet } from "../lib/nomai-api";

// Entry point of every Traveler research request — searches published
// listings in the nomai API. Returns listing cards; when checkin/checkout are
// provided the cards carry the stay total (total_minor + total_display).

export default defineTool({
  description:
    "Search published nomai listings. Filter by city/country, stay dates (checkin/checkout YYYY-MM-DD), guests, type (hotel|posada|apartamento|cabana|finca|room|entire_place), amenity codes (all must be present), and max_price_minor. Returns cards with slug, cover photo, nightly price and, when dates are given, total_minor/total_display for the whole stay. Always use this before recommending a place — never invent listings or prices.",
  inputSchema: z.object({
    city: z.string().optional().describe("City name, e.g. 'Buenos Aires' or 'Cusco'"),
    country: z
      .string()
      .optional()
      .describe("Country name ('argentina', 'brasil') or ISO code ('AR', 'CO')"),
    checkin: z.string().optional().describe("Check-in date YYYY-MM-DD"),
    checkout: z.string().optional().describe("Check-out date YYYY-MM-DD"),
    guests: z.number().int().min(1).optional(),
    type: z
      .string()
      .optional()
      .describe("Property type (hotel, posada, apartamento, cabana, finca) or listing kind (room, entire_place)"),
    amenities: z
      .array(z.string())
      .optional()
      .describe("Amenity codes that must ALL be present, e.g. ['wifi','piscina']"),
    max_price_minor: z
      .number()
      .int()
      .optional()
      .describe("Max nightly price in minor units (USD minor = 10^-6, e.g. 120000000 = US$120)"),
  }),
  execute: async (input) => {
    const r = await apiGet<{ results: unknown[] }>("/listings/search", {
      city: input.city,
      country: input.country,
      checkin: input.checkin,
      checkout: input.checkout,
      guests: input.guests,
      type: input.type,
      amenities: input.amenities,
      max_price_minor: input.max_price_minor,
    });
    if (!r.ok) return { error: r.error, code: r.code, results: [] };
    return { count: r.data.results.length, results: r.data.results };
  },
});
