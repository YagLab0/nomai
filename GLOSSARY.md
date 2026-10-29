# nomai

An AI agent that researches and books lodging for LATAM travelers, paying in local
stablecoins (wFIAT) on Celo via x402. Owners are never charged.

## Language

### People and product

**Traveler**:
The person who chats with the Agent and pays for bookings. Product Spanish: *viajero*.
_Avoid_: user, customer, tourist, buyer

**Owner**:
The lodging host who receives bookings. Pays the platform nothing, ever: no
subscription, no commission. Gets paid from Escrow into their own Ripio account,
linked when they join.
Product Spanish: *dueño*, *hotelero*.
_Avoid_: host, merchant, seller, hotel

**Agent**:
The AI that researches options and executes bookings for a Traveler. Free to use;
its cost (LLM inference, paid data APIs) is recovered through the Service fee.
Product name: *Nomito*.
_Avoid_: bot, assistant, Eve

**Lodging**:
A place an Owner lists for Travelers to book (posada, cabaña, departamento…),
priced in the Owner's currency and located in the Owner's country. Its town is
whatever place the Owner finds in the map search — any real place, not a preset
list — while the pin marks the exact spot. A sigla (CFY, TIL…) exists only for
the listed towns; a searched place carries its geocoded name and region instead.
While it has an Upcoming Booking it can't be removed or relocated.
Product Spanish: *alojamiento*.
_Avoid_: property, listing, hotel

**Storefront**:
The public page showing one Owner and all of their Lodgings.
Product Spanish: *escaparate*.
_Avoid_: profile, shop, store page

**Booking**:
A reservation the Traveler pays in full up front, in wFIAT via x402. The rental
amount sits in Escrow until it is released to the Owner.
_Avoid_: reservation, order

**Upcoming Booking**:
A Booking that is confirmed or in progress: not cancelled, check-out not yet
passed. Product Spanish: *reserva confirmada* / *en curso*.
_Avoid_: active booking, pending booking (there is no pending state: payment is confirmation)

**Availability**:
The nights a Lodging is free to book: every night not covered by an Upcoming
Booking. Owners can't block nights. Product Spanish: *disponibilidad*.
_Avoid_: calendar (the UI, not the concept), blocked dates

**Cancellation**:
A Booking ended before check-in, initiated only by the Traveler, under one global
rule: full refund of the rental until 5 days before check-in, 50% after. The
refund comes out of Escrow; the Service fee is never refunded. Product Spanish:
*cancelación*.
_Avoid_: refund (the consequence, not the concept), annulment

**Claim**:
A Traveler's complaint opened within 24 h of check-in, for one of three reasons
only: the Lodging doesn't exist or there was no access, it is substantially
different from the listing, or the Owner didn't show up. Nomai resolves it.
Product Spanish: *reclamo*.
_Avoid_: dispute, complaint, ticket

**Agent wallet**:
The wallet a Traveler's Agent pays Bookings from. One per Traveler, the same on
every network, and it comes into existence the first time the Traveler needs it,
not at signup. The Traveler funds it and sees its balances in the fiats the
wFIAT mirror, but never operates it directly. The verifiable Agent identity
belongs to the nomai project, not to each Agent wallet.
_Avoid_: user wallet, account, custodial wallet

### Money

**wFIAT**:
Ripio's local-currency stablecoins on Celo, each mirroring its fiat 1:1: wARS,
wBRL, wCLP, wCOP, wMXN and wPEN. The Traveler always sees balances and prices in
the fiat, never the token.
_Avoid_: stablecoins, tokens, crypto balance

**Funding**:
The Traveler converting local fiat into wFIAT inside their Agent wallet through
Ripio's ramp. A Traveler may fund in any wFIAT, not only their country's. The
first Funding marks the Traveler as funded for Tiered verification.
Product Spanish: *carga*.
_Avoid_: top-up, deposit, on-ramp (the ramp is the mechanism, not the concept)

**Service fee**:
The platform's fixed-percentage charge to the Traveler on every Booking, shown as
its own line before paying. It pays for the Agent's work, which is otherwise free.
One of two revenue streams. Product Spanish: *tarifa de servicio*.
_Avoid_: commission, booking fee, markup, credits, monedas Nomai (retired)

**Escrow**:
The contract that holds a Booking's rental amount: 50% goes to the Owner when the
Cancellation deadline passes, the rest 24 h after check-in if there is no Claim.
Nomai can only route the funds to that Booking's Traveler or Owner.
_Avoid_: deposit, hold, platform wallet

**FX fee**:
The platform's commission on a currency conversion executed inside the Agent's flow
(e.g. wARS→wBRL). Charged only when a conversion happens. One of two revenue streams.
_Avoid_: markup, spread (also a market term — ambiguous)

**Payout address**:
The Owner's Ripio deposit address on the Celo network — where Escrow releases their
Bookings to. An exchange deposit address can't sign, so it is verified empirically:
the platform sends a small test deposit of the Owner's wFIAT and the Owner confirms
the amount Ripio credited. Product Spanish: *dirección de cobro*.
_Avoid_: wallet address (it is not a wallet the Owner holds keys for), bank account

### Verification

**Tiered verification**:
Identity checks that escalate with risk: phone at signup, first Funding or a
Self passport proof for higher free Agent usage limits, government ID only at
Booking time.

### Reputation

**Review**:
A verified opinion tied one-to-one to a completed Booking — the only proof of
a real stay, so Reviews can't be invented. Every Review runs in one of two
directions (`to_lodging` / `to_traveler`), is written inside the Review
window and is published immediately, with an overall 1–5 stars plus optional
category scores. Product Spanish: *reseña*.
_Avoid_: rating (the score it carries, not the piece), comment, testimonial

**`to_lodging` Review**:
The Traveler's Review of the Lodging they stayed at. Public content: it shows
on the listing page under the Traveler's first name only, feeds the Lodging's
and the Owner's scores, and is the only direction that can carry an Owner
reply. Categories: cleanliness, accuracy, check-in, communication, location,
value.

**`to_traveler` Review**:
The Owner's Review of the guest. Never public: readable only by the rated
Traveler, the Owner who wrote it and Owners who have hosted that Traveler —
the guest score exists so an Owner can size up a guest, not to shame anyone.
Categories: cleanliness, communication, house rules.

**Review window**:
The 14 days after check-out during which each side may post its Review
(Airbnb's window). Once it closes, the Booking can no longer be reviewed by
either side.
_Avoid_: deadline, review period (vague)

**Recency-weighted score**:
The aggregate the Reviews feed: a weighted average where each Review's weight
starts at 1 and decays linearly to zero 36 months after it was written
(Booking's model — recent stays shape the score, old ones fade out). Cached
on `listings.rating`/`reviews` and `businesses.rating`/`reviews`; the
Traveler's own score is computed on read and is never public.
_Avoid_: average, plain rating

**Owner reply**:
The Owner's public answer shown under a `to_lodging` Review they received —
one per Review, and posting an empty body clears it.
Product Spanish: *respuesta del dueño*.
