'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

import type { Lodging } from '@/lib/lodgings';

/** Terra teardrop pin, inlined so the marker needs no bundled image assets. */
const PIN = L.icon({
  iconUrl: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" fill="#B4552D" stroke="#8F3F20" stroke-width="1.2"/><circle cx="12" cy="9.5" r="2.6" fill="#FBF6F0"/></svg>',
  )}`,
  iconSize: [30, 30],
  iconAnchor: [15, 27],
});

/**
 * The Lodging's exact location on OpenStreetMap (public by design, owner-views
 * §9). Loaded client-only through `next/dynamic` — Leaflet needs the DOM.
 */
export default function LodgingMap({ lodging }: { lodging: Lodging }) {
  const center: [number, number] = [lodging.lat!, lodging.lng!];
  return (
    <MapContainer
      center={center}
      zoom={15}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={center} icon={PIN} title={lodging.name} />
    </MapContainer>
  );
}
