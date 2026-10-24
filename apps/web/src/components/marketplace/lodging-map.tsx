'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

import { OSM_ATTRIBUTION, OSM_TILES, PIN } from '@/components/map-pin';
import type { Lodging } from '@/lib/lodgings';

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
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
      <Marker position={center} icon={PIN} title={lodging.name} alt={`Ubicación de ${lodging.name}`} keyboard={false} />
    </MapContainer>
  );
}
