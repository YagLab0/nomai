# nomai

An AI agent that researches and books lodging for LATAM travelers, paying in local
stablecoins (wFIAT) on Celo via x402. Owners are never charged.

## Language

### People and product

**Traveler**:
The person who chats with the Agent and pays for bookings. Product Spanish: *viajero*.
_Avoid_: user, customer, tourist, buyer

**Owner**:
The lodging host who receives bookings. Pays the platform nothing, ever.
Product Spanish: *dueño*, *hotelero*.
_Avoid_: host, merchant, seller, hotel

**Agent**:
The AI that researches options and executes bookings for a Traveler. Every research
run spends real money on LLM inference and paid data APIs. Product name: *Nomito*.
_Avoid_: bot, assistant, Eve

**Lodging**:
A place an Owner lists for Travelers to book (posada, cabaña, departamento…).
Product Spanish: *alojamiento*.
_Avoid_: property, listing, hotel

**Booking**:
A paid reservation settled by an x402 payment in wFIAT, direct to the Owner's wallet.
_Avoid_: reservation, order

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
