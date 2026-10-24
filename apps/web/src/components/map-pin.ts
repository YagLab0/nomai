import L from 'leaflet';

/**
 * Shared Leaflet pieces. Leaflet touches `window` on import, so only modules
 * loaded through `next/dynamic` with `ssr: false` may import this file.
 */

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Terra teardrop pin, inlined so the marker needs no bundled image assets. */
export const PIN = L.icon({
  iconUrl: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" fill="#B4552D" stroke="#8F3F20" stroke-width="1.2"/><circle cx="12" cy="9.5" r="2.6" fill="#FBF6F0"/></svg>',
  )}`,
  iconSize: [30, 30],
  iconAnchor: [15, 27],
});
