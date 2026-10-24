# Bookings settle through an escrow contract, released to the Owner in stages

A Booking's rental amount is paid up front into an **escrow** contract on Celo, not
straight to the Owner's wallet. The Service fee goes to the platform at payment
time. The escrow releases to the Owner in two stages: **50% when the Cancellation
deadline passes** (5 days before check-in) and **the rest 24 h after check-in** if
no Claim was opened. This fixes what ADR-0004 left open (a refund when the Owner has
already withdrawn the money) and gives the Traveler a reason to pay up front to a
Lodging they have never seen.

Supersedes ADR-0004 and ADR-0001's "the x402 `payTo` is the Owner's own wallet".

## Rules

- **Cancellation** is still Traveler-initiated only, under one global rule: full
  refund of the rental until 5 days before check-in, 50% after. A Booking made
  inside that window is 50% refundable from the start, and the Traveler is told
  before paying. Refunds come straight out of the escrow, so they are immediate.
- **Claims**: the Traveler has 24 h from check-in to open one, with photos or
  messages as evidence, for one of three reasons only: the Lodging doesn't exist or
  there was no access, it is substantially different from the listing, or the Owner
  didn't show up. Nomai resolves Claims by hand: full refund, partial refund, or full
  release to the Owner.
- The escrow's arbiter role can only send a Booking's funds to that Booking's
  Traveler or Owner, nowhere else. Nomai decides disputes but never takes custody.
- The platform pays the gas for releases and refunds (fractions of a cent on Celo).

## Considered options

- **Pay the Owner directly (ADR-0001/0004)**: rejected. Refunds depend on the Owner
  sending money back, and the Traveler has no protection.
- **Cancellation deadline 2 days before check-in**: rejected. The Owner has almost
  no time to rebook the dates. 7 days (ADR-0004) was too harsh on weekend getaways
  booked a few days ahead.
- **Release everything at check-in**: rejected. It leaves no window for a "the
  cabin doesn't exist" Claim.
- **Decentralized arbitration (e.g. Kleros)**: deferred until there is volume.

## Consequences

- An escrow contract with a release schedule and an arbiter role is now required.
  The x402 `payTo` of a Booking becomes the escrow, not the Owner's wallet.
- Something has to trigger the time-based releases (a keeper or scheduled job).
- The Owner's dashboard shows money in escrow, released and pending, not just paid.
- Booking lifecycle: Confirmada → En curso → Completada, or Cancelada before
  check-in; a Claim can sit between En curso and Completada.
- Whether the Traveler recovers the FX fee on a Cancellation is still undecided.
