---
status: accepted, amended by ADR-0005 (Credits dropped; tiers and ceilings now gate free Agent usage)
---

# Free credits are released by verification tier, bounded by hard spend ceilings

The Agent's free tier costs real money per search, so the free grant is released in
tiers instead of all at once: a small amount on phone verification (WhatsApp/SMS,
VoIP numbers rejected, captcha on web), the rest on first Ripio funding — which
reuses Ripio's own KYC, the only path that covers LATAM national IDs — or on a Self
proof-of-human. Grants are non-transferable and non-withdrawable, so sybil accounts
have nothing to resell. Government ID is collected at Booking time (Airbnb's
pattern), never at signup.

Spend ceilings bound the worst case regardless of attacker count: a daily budget for
all free usage, per-account rate limits, staged search costs (conversation → cached
inventory → paid live queries only on a shortlist), an LLM provider spend cap, and
the Agent's x402 wallet balance as a hard cap on paid data calls.

## Considered options

- **KYC / DNI at signup**: rejected — kills the funnel at step one, per-verification
  cost exceeds the grant's value, and storing documents creates a data-protection
  liability (AR ley 25.326, BR LGPD).
- **Self passport as the primary gate**: rejected — Self supports passports and EU ID
  cards but no LATAM national ID; the core persona (e.g. an Argentine going to
  Floripa) often travels Mercosur routes on DNI and may not hold a passport. Kept as
  an optional alternative tier.
- **On-chain transferable credits**: rejected — withdrawable grants would have resale
  value (a sybil payoff) and a token-like regulatory surface.

## Consequences

- Any feature that spends Credits or touches the Agent wallet must respect both
  the daily budget and the wallet-balance cap; new verification steps belong
  inside the tier ladder, not as ad-hoc checks.
