# Each Booking opens a private Traveler↔Owner thread that only its two parties can read and write

Coordination around a stay — arrival time, access details, questions —
needs a channel that doesn't force the parties to trade personal contact
details or take the deal off-platform. The model is Airbnb's: messaging
scoped to the reservation, not to the people. **The Booking IS the
Thread**: there is no threads table, `booking_messages.booking_id` is the
thread's whole identity and its lifecycle is the Booking's (`on delete
cascade`). The thread **opens with the Booking itself** — an
`AFTER INSERT` trigger writes a platform system message, so the channel
exists from the same moment the Booking does and never starts empty — and
**both parties may write in any Booking status**, `cancelled` included.
Privacy is structural: RLS lets only the Booking's Traveler and the
Lodging's Owner select rows, and the only write path is a pair of
`security definer` RPCs locked to `service_role`, so every message goes
through `apps/api`. This is a second, person↔person messaging surface next
to the Agent chat (`chat_threads`) — the two never mix.

## Rules

- One Thread per Booking. `booking_messages` rows carry `booking_id`,
  `sender_id` (→ `auth.users`, null on system rows), `sender_role`
  (`traveler`/`owner`/`system`), `body`, `read_at` and `created_at`;
  indexed `(booking_id, created_at)`. **No edit, no delete** — like
  Airbnb, a sent message is final.
- The `booking_messages_on_booking` AFTER INSERT trigger on `bookings`
  opens every thread with one `system` row ("Reserva recibida — ya podés
  coordinar los detalles con tu anfitrión."). `system` rows are written
  by triggers, never by callers.
- **Any Booking status**: `send_message` checks only that the caller is a
  party — coordination doesn't stop at Cancellation or completion. The UI
  may still choose where to surface the CTA.
- `sender_role` is derived inside the RPC from the caller's relationship
  to the Booking (the Booking's Traveler → `traveler`, the Lodging's
  business owner → `owner`) — never trusted from the request body. The
  only validation on `body` is non-empty (`empty_body`); errors are
  `not_found`/`forbidden` otherwise.
- **Party-only reads**: `booking_messages_party_read` (`for select`)
  uses `is_booking_party(auth.uid(), booking_id)` — true when the caller
  is the Booking's `traveler_id` or the user behind the Lodging's
  business (the listings→properties→businesses chain, same encapsulation
  as `is_owner_of_traveler`). There is **no insert/update/delete
  policy** — writes go through the RPCs.
- **Writes only via RPC**: `send_message(p_user_id, p_booking_id,
  p_body)` and `mark_thread_read(p_user_id, p_booking_id)` are
  `security definer`, EXECUTE revoked from public/anon/authenticated and
  granted to `service_role` — the same lockdown as the escrow and review
  RPCs.
- **One `read_at` is the whole read receipt**: a 1:1 thread gives each
  message exactly one reader, so a single timestamp per row suffices.
  `mark_thread_read` stamps `read_at = now()` on every row in the thread
  not sent by the caller; the UI renders "Visto" under the sender's last
  own message.
- **GET marks read**: `GET …/messages` lists the thread, reports `unread`
  counted before marking, then runs `mark_thread_read` for the caller —
  opening the thread is the act of reading it.
- **Realtime over polling**: `booking_messages` sits in the
  `supabase_realtime` publication, so the open thread subscribes to
  `postgres_changes` INSERTs filtered by its `booking_id` — under the
  subscriber's JWT, where `booking_messages_party_read` scopes every
  event to the two parties. Delivery triggers a refetch so `mine` and
  `unread` stay server-computed; a slow poll remains as the fallback
  when the channel isn't available. Unread state is computed on read
  from `read_at` — no denormalized counters to keep in sync.
- API surface: `GET/POST /bookings/:id/messages` (Traveler Bearer),
  `GET/POST /owners/bookings/:id/messages` (Owner Bearer), `GET
  /owners/inbox` (the Owner's threads ordered by last activity with
  unread counts), and `BookingSummary.unread_messages` on the Traveler's
  `GET /bookings`. Messages are returned with a caller-relative `mine`
  flag; errors follow the reviews convention (`empty_body` 400,
  `forbidden` 403, `not_found` 404).

## Considered options

- **A `threads` table** (one thread row per Booking, messages keyed to
  it): rejected — it would store `booking_id` and nothing else. The
  Booking already supplies the thread's identity, ACL and lifecycle. If
  group or support threads ever exist the table can be introduced then.
- **Supabase Realtime subscriptions**: adopted for the open thread —
  `postgres_changes` on `booking_messages` with the publication added in
  `…_booking_messages_realtime.sql`; delivery is already scoped by the
  existing RLS policy so no new auth layer was needed. **Push/email
  notifications** when the app is closed remain deferred — they need a
  different channel (service worker / webhook), not the realtime pipe.
- **Blocking writes on `cancelled`/`refunded` Bookings**: rejected —
  Cancellation is precisely when the parties can still need each other
  (a refund question, a no-show follow-up), and enforcing it would make
  `send_message` lifecycle-aware for no gain. The UI may hide the CTA on
  cancelled Bookings as a product choice; the RPC stays status-agnostic.
- **Contact-info masking** (Airbnb auto-blocks phone numbers and emails
  in bodies to fight leakage): deferred — worth revisiting as a
  `send_message` body filter if off-platform deals become a problem.
- **Edit/delete and moderation/flagging**: deferred — a sent message is
  final; there is no abuse to moderate yet, and a report surface can be
  added later without changing the schema.

## Consequences

- Every message write travels `apps/web` → `apps/api` → the locked-down
  RPCs; PostgREST can't insert at all (no insert policy) — the same
  posture as Bookings, payments and Reviews.
- A thread always has at least the system row, so thread reads and inbox
  listings can rely on a non-empty history; deleting a Booking deletes
  its whole thread.
- Read state is fully derived: `unread_messages` and the inbox badges are
  counts of the counterpart's `read_at is null` rows, computed on read —
  nothing denormalized.
- Keeping coordination on-platform removes the parties' main reason to
  exchange contact details — a quiet win against off-platform leakage.
- Deferred to later issues: push/email notification on new messages,
  presence/typing indicators, edit/delete and moderation, contact-info
  masking, and per-status write rules if they ever become needed.
