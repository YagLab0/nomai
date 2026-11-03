/**
 * Booking message fixtures (ADR-0009): a short Traveler↔Owner exchange on
 * existing `bkg_seed_*` Bookings so the thread demo opens with real content.
 * Like the review fixtures, the senders are synthetic — sender_id stays null
 * and sender_role carries the side (same convention the migration's 'system'
 * rows use for messages without a linked auth user).
 *
 * The AFTER INSERT trigger on bookings adds the 'system' welcome row by
 * itself — the fixtures only carry the human exchange. Ids are fixed uuids
 * so the generated seed stays idempotent (`on conflict do nothing` hits the
 * pk on re-runs).
 *
 * Used by scripts/gen-seed.ts (→ supabase/seed.sql) and seeded into the
 * mock's chat store in repo.ts.
 */
export type MessageFixture = {
  id: string;
  booking: string;
  sender_role: "traveler" | "owner" | "system";
  body: string;
  /** The counterpart's "visto" mark — null while unread. */
  read_at: string | null;
  created: string;
};

export const MESSAGE_FIXTURES: MessageFixture[] = [
  {
    id: "deedbeef-0000-4000-8000-000000000001",
    booking: "bkg_seed_adobe_1",
    sender_role: "traveler",
    body: "¡Hola Ramón! Somos Sofía y Diego. ¿A qué hora podemos hacer el check-in el viernes? Llegamos a Cafayate tipo 15.",
    read_at: "2026-09-22T10:40:00-03:00",
    created: "2026-09-22T10:05:00-03:00",
  },
  {
    id: "deedbeef-0000-4000-8000-000000000002",
    booking: "bkg_seed_adobe_1",
    sender_role: "owner",
    body: "¡Hola Sofía! El check-in es desde las 14, así que llegan perfecto. Les dejo la estufa prendida y una lista de bodegas sobre la mesa.",
    read_at: "2026-09-22T19:02:00-03:00",
    created: "2026-09-22T10:40:00-03:00",
  },
  {
    id: "deedbeef-0000-4000-8000-000000000003",
    booking: "bkg_seed_colores_1",
    sender_role: "traveler",
    body: "Lidia, ¿la cabaña tiene estacionamiento? Vamos en auto desde Salta.",
    read_at: "2026-09-30T20:15:00-03:00",
    created: "2026-09-30T18:30:00-03:00",
  },
  {
    id: "deedbeef-0000-4000-8000-000000000004",
    booking: "bkg_seed_colores_1",
    sender_role: "owner",
    body: "¡Hola Bruno! Sí, tienen lugar para dejar el auto justo frente a la cabaña. Cualquier cosa me escribís.",
    read_at: null,
    created: "2026-09-30T20:15:00-03:00",
  },
];
