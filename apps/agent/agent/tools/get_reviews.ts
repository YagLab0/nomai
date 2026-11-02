import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet } from "../lib/nomai-api";

// GET /listings/:slug/reviews — the Lodging's public Reviews (ADR-0008):
// weighted score, per-category averages and the written reviews themselves.
// Public route, no Bearer needed.

interface ListingReviews {
  rating: number | null;
  reviews: number;
  categories: Record<string, number | null>;
  items: {
    review_id: string;
    rating: number;
    body: string | null;
    author: string;
    created_at: string;
    [k: string]: unknown;
  }[];
}

export default defineTool({
  description:
    "Get a listing's public Reviews: weighted `rating` (null when there are none yet — say 'todavía no tiene reseñas', never invent one), `reviews` count, per-`categories` averages and the written `items` (rating, body, author, date). Render them with ReviewSummary + ReviewList — pass the fields verbatim, never fabricate a review or a score.",
  inputSchema: z.object({
    slug: z.string().describe("The listing slug"),
  }),
  execute: async ({ slug }) => {
    const r = await apiGet<ListingReviews>(
      `/listings/${encodeURIComponent(slug)}/reviews`
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
