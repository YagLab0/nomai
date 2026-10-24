'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';

import { OSM_ATTRIBUTION, OSM_TILES, PIN } from '@/components/map-pin';

/**
 * MapCard's Leaflet body — same tiles and terra pin as the marketplace's
 * LodgingMap, but driven by bare coordinates and a zoom level. Leaflet touches
 * `window` on import: load this module only through `next/dynamic` with
 * `ssr: false`.
 */
export default function MapCardMap({
  lat,
  lng,
  label,
  zoom,
}: {
  lat: number;
  lng: number;
  label: string;
  zoom: number;
}) {
  const center: [number, number] = [lat, lng];
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
      <Marker position={center} icon={PIN} title={label} alt={`Ubicación de ${label}`} keyboard={false} />
    </MapContainer>
  );
}
