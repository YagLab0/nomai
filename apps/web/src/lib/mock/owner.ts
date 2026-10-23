/** Mock Owner for the dashboard panel. Replaced by the account API later. */

import { ownerBySlug } from '@/lib/lodgings';

/**
 * The logged-in Owner: Ramón Guaymás. His Casa de Adobe is the Booking Lucas
 * confirms in the §4 scenario — here it shows up as money received.
 */
export const currentOwner = ownerBySlug('ramon-guaymas')!;
