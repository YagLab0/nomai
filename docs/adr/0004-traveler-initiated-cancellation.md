# Cancellation is Traveler-initiated, under one global refund policy

A Booking's x402 payment settles straight into the Owner's wallet, so a
cancellation is money that must flow back from the Owner to the Traveler — not
a state flip, and not an escrow release: the platform never holds funds.
Only the Traveler can cancel a Booking; the Owner sees the outcome in their
dashboard ("Cancelada", refunded amount) and cannot initiate one. Refunds
follow a single global rule: full until 7 days before check-in, 50% inside
that window.

## Considered options

- **Owner-initiated cancellation**: rejected for now — the Owner already
  holds the funds, so cancelling means sending money back, plus a reputation
  consequence (delisting? penalty?) that deserves its own design.
- **Per-lodging cancellation policy chosen by the Owner**: rejected — adds a
  `Lodging` field and a picker for flexibility nobody has asked for yet;
  revisit if Owners do.
- **Full refund always**: rejected — a last-minute cancellation would leave
  the Owner with a blocked calendar and nothing else.

## Consequences

- `GLOSSARY.md` gains **Cancellation**; "refund" names its consequence, not a
  separate concept.
- A Booking's lifecycle is Confirmada → En curso → Completada, or Cancelada
  before check-in. There is no "pending payment": the payment *is* the
  confirmation.
- The refund's mechanics (a payment back out of the Owner's wallet; who
  fronts it if the Owner already withdrew) are deliberately unspecified until
  a real backend exists — the web template only renders the outcome.
- Whether the Traveler recovers the FX fee on a Cancellation is a separate
  decision, not made here.
