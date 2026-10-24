'use client';

import 'leaflet/dist/leaflet.css';
import type { Marker as LeafletMarker } from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

import { OSM_ATTRIBUTION, OSM_TILES, PIN } from '@/components/map-pin';

export interface Pin {
  lat: number;
  lng: number;
}

/** The static poster before a place is picked: the whole continent, unmoving. */
const SOUTH_AMERICA: [[number, number], [number, number]] = [
  [-56, -82],
  [14, -34],
];

const ARGENTINA: Pin = { lat: -36, lng: -64 };

/** One arrow press moves the pin about 20 m. */
const STEP = 0.0002;
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [STEP, 0],
  ArrowDown: [-STEP, 0],
  ArrowLeft: [0, -STEP],
  ArrowRight: [0, STEP],
};

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Re-measures when the modal step shows; a fresh search flies to the place,
 * a fresh pin dives to street level.
 */
function MapSync({ pin, focus }: { pin: Pin | null; focus: Pin | null }) {
  const map = useMap();
  const hadPin = useRef(pin !== null);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (!pin) {
      if (focus) map.setView([focus.lat, focus.lng], 12);
      return;
    }
    if (!hadPin.current) {
      hadPin.current = true;
      map.setView([pin.lat, pin.lng], 15);
    } else {
      map.panInside([pin.lat, pin.lng], { padding: [30, 30] });
    }
  }, [map, pin?.lat, pin?.lng, focus?.lat, focus?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** A click anywhere on the map drops the pin there. */
function MapPick({ onPick }: { onPick: (pin: Pin) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }),
  });
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
 * The wizard's Ubicación map. Before a place is searched it is a poster of
 * South America — nothing moves. Once the Owner picks a place the map unlocks:
 * it flies there, pans and zooms freely, and a click drops the pin (which then
 * drags or nudges with arrow keys). Client-only (`next/dynamic`).
 */
export default function PinPickerMap({
  pin,
  focus,
  interactive,
  onPick,
  onChange,
}: {
  pin: Pin | null;
  /** The searched place's center — where an unlocked map first flies. */
  focus: Pin | null;
  /** False renders the unmoving poster; true unlocks pan, zoom and marking. */
  interactive: boolean;
  onPick: (pin: Pin) => void;
  onChange: (pin: Pin) => void;
}) {
  // The `key` remounts the map when it unlocks: Leaflet reads interaction
  // options only at construction.
  const center = pin ?? focus ?? ARGENTINA;
  return (
    <MapContainer
      key={interactive ? 'live' : 'poster'}
      {...(interactive
        ? { center: [center.lat, center.lng] as [number, number], zoom: pin ? 15 : 12 }
        : { bounds: SOUTH_AMERICA })}
      dragging={interactive}
      zoomControl={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      boxZoom={interactive}
      keyboard={false}
      className="h-full w-full"
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
      {interactive && <MapSync pin={pin} focus={focus} />}
      {interactive && <MapPick onPick={onPick} />}
      {interactive && pin && <DraggablePin pin={pin} onChange={onChange} />}
    </MapContainer>
  );
}
