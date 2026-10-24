# nomai

An AI agent that researches and books lodging for LATAM travelers, paying in local
stablecoins (wFIAT) on Celo via x402. Owners are never charged.

## Language

### People and product

**Traveler**:
The person who chats with the Agent and pays for bookings. Product Spanish: *viajero*.
_Avoid_: user, customer, tourist, buyer

**Owner**:
The lodging host who receives bookings. Pays the platform nothing, ever. Gets paid
into their own Ripio account, linked when they join.
Product Spanish: *dueño*, *hotelero*.
_Avoid_: host, merchant, seller, hotel

**Agent**:
The AI that researches options and executes bookings for a Traveler. Every research
run spends real money on LLM inference and paid data APIs. Product name: *Nomito*.
_Avoid_: bot, assistant, Eve

**Lodging**:
A place an Owner lists for Travelers to book (posada, cabaña, departamento…),
priced in the Owner's currency and located in the Owner's country. While it has
an Upcoming Booking it can't be removed or relocated.
Product Spanish: *alojamiento*.
_Avoid_: property, listing, hotel

**Storefront**:
The public page showing one Owner and all of their Lodgings.
Product Spanish: *escaparate*.
_Avoid_: profile, shop, store page

**Booking**:
A paid reservation settled by an x402 payment in wFIAT, direct to the Owner's wallet.
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
rule: full refund until 7 days before check-in, 50% after. The money returns out
of the Owner's wallet, which already holds the payment. Product Spanish:
*cancelación*.
_Avoid_: refund (the consequence, not the concept), annulment

**Agent wallet**:
The wallet a Traveler's Agent pays Bookings from. One per Traveler, with its own
verifiable Agent identity. The Traveler funds it and sees its balance in local
currency, but never operates it directly.
_Avoid_: user wallet, account, custodial wallet

### Money

**Credit**:
A unit of Agent usage sold to the Traveler as *monedas Nomai*. Searches spend credits
by stage: conversation and cached inventory cost little; live availability and pricing
on a shortlist cost most.
_Avoid_: coin, token, point, balance

**Free grant**:
The Credits given to new accounts, released in verification tiers. Non-transferable
and non-withdrawable — no resale value.
_Avoid_: free trial, bonus, airdrop

**FX fee**:
The platform's commission on a currency conversion executed inside the Agent's flow
(e.g. wARS→wBRL). Charged only when a conversion happens. One of two revenue streams.
_Avoid_: markup, spread (also a market term — ambiguous)

### Verification

**Tiered verification**:
Identity checks that escalate with risk: phone at signup, first Ripio funding or a
Self passport proof for the full free grant, government ID only at Booking time.
