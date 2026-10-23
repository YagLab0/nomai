# One Agent wallet per Traveler; the Traveler never touches web3

Bookings are paid from an Agent wallet that belongs to the Traveler's own Agent
(*Nomito*), one per Traveler, each with a verifiable Agent identity (ERC-8004). The
Traveler funds it in local currency and sees a local-currency balance ("$ 120.000
ARS"), never wFIAT tickers, addresses or signatures. This refines ADR-0001's "the
platform never holds booking funds": funds sit in a wallet isolated to one
Traveler, never pooled in a platform wallet.

## Considered options

- **Traveler connects their own wallet (MiniPay/MetaMask)**: rejected — the target
  Traveler doesn't know crypto ("el dólar nunca aparece"); a wallet prompt kills
  the funnel.
- **One platform Agent wallet for every Booking**: rejected — pools Traveler funds,
  making the platform a custodian and contradicting ADR-0001.

## Consequences

- Who holds the signing key of each Agent wallet (platform-managed key, MPC, smart
  account with Traveler-held recovery) is still open, and it decides how
  non-custodial this really is. Resolve before any mainnet Booking.
