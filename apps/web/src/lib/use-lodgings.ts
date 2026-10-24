'use client';

import { useSyncExternalStore } from 'react';

import { catalog } from '@/lib/catalog';
import { LODGINGS, type Lodging } from '@/lib/lodgings';

/**
 * Merged Lodgings for client surfaces (owner-views §9). Server render and
 * hydration see the seed; Lodgings created in this browser load and
 * re-render right after mount.
 */
export function useLodgings(): Lodging[] {
  return useSyncExternalStore(catalog.subscribe, catalog.all, () => LODGINGS);
}

/**
 * The browser's created/overridden/tombstoned Lodgings applied onto a list
 * that came from the network — the listings API — re-merging on every
 * catalog commit. Pass `null` while the base is still loading.
 */
export function useLodgingOverlay(base: Lodging[] | null): Lodging[] | null {
  useLodgings(); // subscribes: this re-renders on every catalog commit
  return base === null ? null : catalog.overlay(base);
}
