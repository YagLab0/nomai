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
A place an Owner lists for Travelers to book (posada, cabaña, departamento…).
Product Spanish: *alojamiento*.
_Avoid_: property, listing, hotel

**Booking**:
A reservation the Traveler pays in full up front, in wFIAT via x402. The rental
amount sits in Escrow until it is released to the Owner.
_Avoid_: reservation, order

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
The wallet a Traveler's Agent pays Bookings from. One per Traveler, with its own
verifiable Agent identity. The Traveler funds it and sees its balance in local
currency, but never operates it directly.
_Avoid_: user wallet, account, custodial wallet

### Money

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

### Verification

**Tiered verification**:
Identity checks that escalate with risk: phone at signup, first Ripio funding or a
Self passport proof for higher free Agent usage limits, government ID only at
Booking time.
