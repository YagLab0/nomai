# Two revenue streams: Credits and FX fee; Owners are never charged

nomai earns revenue in exactly two ways. First, **Credits** (*monedas Nomai*):
Travelers buy them to fund Agent research, and searches spend them by stage —
conversation and cached inventory cost little, live availability and pricing on
a shortlist cost most. Second, an **FX fee**: a commission on currency
conversions executed inside the Agent's flow (e.g. wARS→wBRL), charged only
when a conversion happens.

Owners are never charged, ever. A Booking's x402 `payTo` is the Owner's own
wallet, so the platform never holds booking funds and there is no payout flow
to build, secure, or regulate.

## Considered Options

Charging Owners a commission on each Booking — the obvious path, since
incumbent OTAs charge hosts 15–25%. Rejected: the wedge into this market is
offering Owners a channel that costs them nothing, and keeping booking funds
wallet-to-wallet means nomai never becomes a custodian of lodging revenue.

## Consequences

Revenue scales with Agent usage and cross-currency activity, not with booking
volume. Because the platform never touches booking funds, a Booking's payment
path (`apps/api`) can stay a plain x402 seller with `payTo` set per-request —
no escrow, no split payments, no owner payout ledger.
