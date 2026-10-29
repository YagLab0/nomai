/**
 * Listing photos are stored either root-relative (`/images/*.webp` — the
 * curated set that ships inside apps/web) or absolute (Owner uploads in the
 * `listing-photos` Supabase Storage bucket). API consumers — the Agent, MCP
 * clients — can't resolve a bare path, so serialization absolutizes
 * root-relative ones against PUBLIC_WEB_URL, the web app that hosts them.
 * Absolute URLs pass through untouched.
 */
export function resolvePhotoUrl(url: string): string {
  if (!url.startsWith("/")) return url;
  const base = (
    process.env.PUBLIC_WEB_URL ?? "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}${url}`;
}
