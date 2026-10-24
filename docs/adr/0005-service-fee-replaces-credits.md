# Business model: a fixed service fee per Booking replaces Credits; Owners still never pay

Revenue now comes from two streams: (1) a **Service fee** charged to the Traveler
on every Booking, a fixed percentage of the rental price (somewhere in 5–8%; the
exact number is still to be set), shown as its own line before paying; and (2) the
**FX fee** on conversions the Agent executes, unchanged from ADR-0001. The Service
fee pays for the Agent's work (LLM inference, paid data APIs), so Agent research is
free to the Traveler and **Credits (*monedas Nomai*) are dropped**. Owners still
pay nothing: no subscription, no commission.

Supersedes ADR-0001.

## Considered options

- **Keep Credits**: rejected. Charging per search makes the Traveler hesitate before
  using the Agent, which is the product. Charging at the Booking ties revenue to the
  moment the Traveler gets value.
- **Fee that varies with Agent usage**: rejected. It punishes exploration, and the
  final price is only known at the end. A fixed percentage is transparent from the
  first message.
- **Lower fee for Bookings made straight from the marketplace, without the Agent**:
  rejected in favour of one fixed percentage, which is simpler to explain.
- **Owner subscription, free until the first Booking**: rejected. It fixes onboarding
  but not low season (months with zero Bookings still bill), and it ends the "cero
  comisión" pitch.

## Consequences

- Revenue grows with the number and value of Bookings. Domestic, single-currency
  trips (wARS→wARS) now earn money too.
- **Leakage risk**: a Traveler can use the Agent for free and then book the Owner
  outside the platform. Mitigations: the Owner's contact details stay hidden until
  the Booking is paid; the Booking page shows what the Traveler gets only on Nomai
  (escrow, refundable Cancellation, Claims, FX rate without dólar tarjeta); reviews
  and ranking count only Nomai Bookings; ADR-0002's daily budget and per-account
  limits still cap free Agent usage.
- The Service fee is not refunded on a Cancellation, since the Agent's work is
  already done (see ADR-0006).
- ADR-0002's verification tiers and spend ceilings stay, but they now gate free
  Agent usage instead of releasing free Credits.
- Code and docs built around Credits (`credit_ledger`, the monedas widgets, the
  generic `POST /paid` Credits sale) need reworking.
