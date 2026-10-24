import { LODGINGS, type Lodging } from '@/lib/lodgings';

/**
 * The catalog: one store for every surface that reads Lodgings (owner-views
 * §9). For now it only wraps the seed; Owner writes, overrides and
 * persistence land here next.
 */
export const catalog = {
  all(): Lodging[] {
    return LODGINGS;
  },

  byId(id: string): Lodging | undefined {
    return LODGINGS.find((l) => l.id === id);
  },

  byOwner(ownerSlug: string): Lodging[] {
    return LODGINGS.filter((l) => l.ownerSlug === ownerSlug);
  },

  byTown(town: string): Lodging[] {
    const t = town.toLowerCase();
    return LODGINGS.filter((l) => l.city.toLowerCase() === t);
  },
};

/** The headline scenario: Casa de Adobe, Cafayate. */
export const CASA_DE_ADOBE = catalog.byId('casa-de-adobe')!;
