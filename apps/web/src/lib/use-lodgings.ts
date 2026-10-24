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
