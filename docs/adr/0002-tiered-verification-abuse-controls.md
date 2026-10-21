# Tiered verification and hard spend caps as abuse controls

Free grants of Credits are released in **verification tiers** rather than all
at signup: phone verification at account creation, the full grant after a first
Ripio funding or a Self passport proof, and government ID only at Booking time.
Two hard caps bound what abuse can cost: a daily free-tier budget, and the
Agent wallet's own balance — every research run spends real money on LLM
inference and paid data APIs, so the wallet balance is the ultimate spend
limit.

## Considered Options

Full KYC upfront. Rejected: it would kill conversion at the top of the funnel,
and most Travelers will never reach Booking — the stage where identity
actually matters for payment integrity. Verification cost is matched to the
risk of each stage instead.

## Consequences

Free grants are non-transferable and non-withdrawable, so they carry no resale
value and farming them is pointless beyond the daily budget. Any feature that
spends Credits or touches the Agent wallet must respect both caps; new
verification steps belong inside the tier ladder, not as ad-hoc checks.
