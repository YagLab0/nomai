# Business model: traveler credits + FX fee; owners never pay; bookings settle direct to owner

Revenue comes from exactly two streams. (1) Credits (*monedas Nomai*) that the
Traveler buys to run Agent research — each search spends real money on LLM inference
and paid data APIs (LiteAPI, usebuy.ai/x402), so the person generating the cost pays
for it. (2) An FX fee taken inside the Agent's own currency conversion (e.g.
wARS→wBRL), charged only when a conversion happens — the one place the Traveler's
large saving exists (dólar tarjeta ~30%, IOF + spread ~7–9.5%).

Owners are never charged: the pitch's "cero comisión" is literal. The x402 `payTo`
for a Booking is the Owner's own wallet, so the platform never holds booking funds —
no custody, no money-transmitter exposure, and no need for a splitter contract until
a fee or escrow exists.

## Considered options

- **Visible service fee on the Traveler**: rejected — the Traveler's saving comes
  from Ripio's rails, which any wallet can offer; what is defensible is the Agent's
  work and demand brought to the Owner.
- **Owner subscription**: rejected — fails in low season (months with zero bookings
  still bill).
- **Owner credits / prepay**: rejected — same upfront cost for a seasonal business.
- **Wholesale-margin resale (LiteAPI rates)**: rejected — contradicts "pay the owner
  direct" and makes the platform merchant of record.

## Consequences

- Domestic trips in one currency (wARS→wARS) monetize only via Credits — unless the
  rental is USD-priced (common in AR tourist rentals), in which case the conversion
  is wARS→USDC: real demand, but it sits against the pitch's "the dollar never
  appears" line. Demo stays wARS→wBRL.
- A Traveler who arrives already holding destination-currency wFIAT bypasses the FX
  fee. Accepted leak: mitigated by making the Agent's conversion the default path
  (Ripio funding link in the Traveler's own currency, rate locked at quote time).
- The FX fee is shown to the Traveler as its own line at Booking confirmation
  (rate + Nomai commission), never folded into the rate — transparency against
  the dólar tarjeta is part of the pitch.
