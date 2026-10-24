import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet } from "../lib/nomai-api";

// Full listing detail for the Traveler — house rules, amenities, photos,
// cancellation policy, property info — before they commit to a stay.

export default defineTool({
  description:
    "Get the full detail of one listing by its slug (from search_listings results). Returns description, house rules (pets/smoking/events), amenities, photos, cancellation policy, property address/city/timezone and the Owner business name.",
  inputSchema: z.object({
    slug: z.string().describe("The listing slug, e.g. 'loft-reciclado-san-telmo'"),
  }),
  execute: async ({ slug }) => {
    const r = await apiGet<Record<string, unknown>>(`/listings/${slug}`);
    if (!r.ok) return { error: r.error, code: r.code };
    return r.data;
  },
});
