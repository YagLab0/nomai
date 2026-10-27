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

### Testnet Custody (GitHub issue #16)

For testnet (`celo-sepolia`), each Traveler's Agent wallet address is derived deterministically from the platform secret `AGENT_WALLET_MASTER_SECRET` combined with the `traveler_id`:
`privateKey = keccak256(AGENT_WALLET_MASTER_SECRET + ":" + traveler_id)`
`address = privateKeyToAccount(privateKey).address`

### Amendment: lifecycle and identity

- **Created on first wallet action, not at signup.** An Agent wallet comes into
  existence the first time the Traveler needs it — checking their balance,
  funding through the ramp, or paying a Booking. Signing up or chatting never
  creates one, so accounts that never transact (e.g. Owners who only list) have
  none. That first action blocks until the wallet exists; on failure the
  Traveler sees a retryable message, never crypto vocabulary.
- **One per Traveler across networks.** The same key yields the same address on
  every EVM network, so the wallet is not per-network; the network is a property
  of the deployment.
- **No per-Traveler ERC-8004 identity.** The verifiable Agent identity is the
  nomai project's, registered from the project's operational wallet. Registering
  one per Traveler would cost platform-paid gas for wallets that may never be
  funded. This supersedes "each with a verifiable Agent identity" above.
- **No default master secret.** Deriving a wallet without
  `AGENT_WALLET_MASTER_SECRET` set is an error, never a fallback value.

**Security Rule:** No private key material is ever stored in the database. The database stores only the public `address`, `network`, and `traveler_id` in `public.agent_wallets`. A conceptual `key_ref` (`env:AGENT_WALLET_MASTER_SECRET#<traveler_id>`) identifies how the server-side signer reconstructs the key when signing Booking transactions.

