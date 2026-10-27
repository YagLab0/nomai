'use client';

import { useSyncExternalStore } from 'react';

import { catalog } from '@/lib/catalog';
import { LODGINGS, type Lodging } from '@/lib/lodgings';
import { hasSupabaseEnv } from '@/lib/supabase/env';

/**
 * Merged Lodgings for client surfaces (owner-views §9). Server render and
 * hydration see the seed; Lodgings created in this browser load and
 * re-render right after mount. With Supabase configured the merged catalog
 * is still the seed — browser writes go through the API instead.
 */
export function useLodgings(): Lodging[] {
  return useSyncExternalStore(catalog.subscribe, hasSupabaseEnv ? () => LODGINGS : catalog.all, () => LODGINGS);
}

/**
 * The browser's created/overridden/tombstoned Lodgings applied onto a list
 * that came from the network — the listings API — re-merging on every
 * catalog commit. Pass `null` while the base is still loading. With Supabase
 * configured the catalog is not consulted: Owner writes live in the DB, and a
 * stale localStorage state must not hide or reshape real inventory.
 */
export function useLodgingOverlay(base: Lodging[] | null): Lodging[] | null {
  useLodgings(); // subscribes: this re-renders on every catalog commit
  if (hasSupabaseEnv) return base;
  return base === null ? null : catalog.overlay(base);
}
