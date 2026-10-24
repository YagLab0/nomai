'use client';

import 'leaflet/dist/leaflet.css';
import type { Marker as LeafletMarker } from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import { OSM_ATTRIBUTION, OSM_TILES, PIN } from '@/components/map-pin';

export interface Pin {
  lat: number;
  lng: number;
}

/** One arrow press moves the pin about 20 m. */
const STEP = 0.0002;
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [STEP, 0],
  ArrowDown: [-STEP, 0],
  ArrowLeft: [0, -STEP],
  ArrowRight: [0, STEP],
};

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Re-centers on the chosen town and re-measures when the modal step shows. */
function MapSync({ center, pin }: { center: Pin; pin: Pin }) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [map, center.lat, center.lng]);
  useEffect(() => {
    map.panInside([pin.lat, pin.lng], { padding: [30, 30] });
  }, [map, pin.lat, pin.lng]);
  return null;
}

function DraggablePin({ pin, onChange }: { pin: Pin; onChange: (pin: Pin) => void }) {
  const marker = useRef<LeafletMarker>(null);
  const latest = useRef({ pin, onChange });
  latest.current = { pin, onChange };

  // Keyboard alternative to dragging (owner-views §9): arrows move the focused pin.
  useEffect(() => {
    const el = marker.current?.getElement();
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const delta = ARROWS[e.key];
      if (!delta) return;
      e.preventDefault();
      e.stopPropagation();
      const { pin: p, onChange: change } = latest.current;
      change({ lat: round(p.lat + delta[0]), lng: round(p.lng + delta[1]) });
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Marker
      ref={marker}
      position={[pin.lat, pin.lng]}
      icon={PIN}
      draggable
      alt="Pin del alojamiento: arrastralo o movelo con las flechas"
      eventHandlers={{
        dragend: (e) => {
          const { lat, lng } = (e.target as LeafletMarker).getLatLng();
          onChange({ lat: round(lat), lng: round(lng) });
        },
      }}
    />
  );
}

/**
 * The wizard's Ubicación map: centered on the town, with a pin the Owner drags
 * to the door. Client-only (`next/dynamic`), like every Leaflet surface.
 */
export default function PinPickerMap({
  center,
  pin,
  onChange,
}: {
  center: Pin;
  pin: Pin;
  onChange: (pin: Pin) => void;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      scrollWheelZoom={false}
      keyboard={false}
      className="h-full w-full"
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
      <MapSync center={center} pin={pin} />
      <DraggablePin pin={pin} onChange={onChange} />
    </MapContainer>
  );
}
