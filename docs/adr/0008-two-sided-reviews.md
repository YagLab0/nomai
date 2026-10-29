# Reviews are two-sided, tied to a completed Booking, and published immediately

Reputation is modeled on Airbnb's two-sided reviews plus Booking's scoring:
after a stay, **the Traveler reviews the Lodging and the Owner reviews the
Traveler** — each inside a **14-day window after check-out** (Airbnb's
window) and **published immediately**. A Review exists only when the Booking
reached `completed`: a verified stay is the only thing anyone can review, so
scores can't be astroturfed and only real Bookings count (ADR-0005's
leakage mitigation already assumed this). Scores are **recency-weighted**:
a Review weighs the most the day it lands and fades linearly to zero at 36
months, so recent stays shape the score while old ones decay.

## Rules

- One Review per direction per Booking (`unique (booking_id, direction)`),
  and only on a `completed` Booking — cancelled, refunded or in-flight stays
  leave no Review on either side.
- **Immediate publication** (product decision): unlike Airbnb's double-blind,
  each side's Review goes live as soon as it's posted — the other side isn't
  held hostage waiting, and the `to_traveler` side is never public anyway.
- The **Review window** is 14 days after check-out; after it, `submit_review`
  rejects with `window_closed` and the UI stops offering the CTA.
- Overall **1–5 stars required**; category scores optional. A `to_lodging`
  Review carries Airbnb's six categories (cleanliness, accuracy, checkin,
  communication, location, value); a `to_traveler` Review carries the three
  that apply to a guest (cleanliness, communication, house_rules). A check
  constraint keeps each direction to its own set.
- **Recency-weighted aggregates**: `review_weight()` decays a Review's weight
  linearly from 1 to 0 over 36 months. `refresh_review_scores()` recomputes
  on each submission (same transaction) and caches the pair on
  `listings.rating`/`reviews` and `businesses.rating`/`reviews` — the latter
  is the Owner's storefront score, Airbnb's host rating.
- The **Traveler score** is computed on read by `traveler_score()` from the
  `to_traveler` rows — never denormalized, never public.
- The **Owner reply** is a public answer under a `to_lodging` Review
  (Booking-style), via `reply_to_review()`; an empty body clears it.
- Public copy never exposes full names: a Traveler signs with first name
  only, an Owner with the business name.
- All writes go through `security definer` RPCs (`submit_review`,
  `reply_to_review`) whose EXECUTE is granted to `service_role` only — same
  lockdown as the booking/escrow RPCs, so every call goes through `apps/api`.
- RLS: `to_lodging` rows are publicly readable; `to_traveler` rows only for
  the rated Traveler, the Owner who wrote them, and Owners who hosted that
  Traveler (`is_owner_of_traveler`) — Airbnb shows guest ratings only to
  hosts, never on a public profile.
- Surfaces: the public listing page's Reviews section
  (`GET /listings/:slug/reviews`), the Traveler's "Mis reservas" CTA on a
  completed Booking (`POST /bookings/:id/review`), the Owner dashboard's
  review feed with reply and rate-the-guest (`GET /owners/reviews`,
  `POST /owners/reviews/:id/reply`, `POST /owners/bookings/:id/review`,
  `GET /owners/travelers/:id/score`), and the Owner's Storefront aggregate.

## Considered options

- **Airbnb's double-blind publication** (both sides hidden until both post or
  the window closes): deferred. It exists to stop retaliatory reviews; our
  asymmetry already does that — `to_traveler` Reviews are never public, so a
  Traveler can't be punished in public, and immediate publication keeps the
  flow simple. Can be revisited if retaliation shows up.
- **Reviews on any Booking, including cancelled**: rejected. Only a completed
  stay is verified experience — anything else invites score manipulation.
- **Simple average**: rejected in favour of recency weighting (Booking's
  model). A Lodging that was great two years ago but slipped shouldn't keep a
  frozen 4.8.
- **Public Traveler score**: rejected. A public guest rating would punish
  Travelers for the platform's benefit; scoping it to Owners who hosted them
  keeps it a host tool, like Airbnb's.
- **Editing a Review inside the window, moderation/flagging, review expiry
  from listings**: deferred — one Review per direction per Booking, no edit;
  flagged content can wait until there's abuse to moderate.

## Consequences

- `listings.rating`/`reviews` stop being seed data and become computed
  values; the seed inserts fixture Reviews and calls
  `refresh_review_scores()` per listing. `businesses` gains the same pair for
  the storefront score.
- Every Review write travels `apps/web` → `apps/api` → the service_role RPCs;
  PostgREST can't reach them, and the RPC re-checks status, window, caller
  and uniqueness inside one transaction — routes never trust body fields.
- A Traveler's reputation now follows them between Owners (scoped, weighted),
  which gives Owners a reason to keep accepting first-time guests carefully
  and gives good guests value only Nomai Bookings build.
- Deferred to later issues: review moderation/flagging, double-blind
  publication if retaliation appears, editing within the window, showing
  expired-window affordances beyond hiding the CTA.
