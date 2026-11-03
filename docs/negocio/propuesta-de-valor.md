# Propuesta de valor (Value Proposition Canvas) — nomai

Al tratarse de una **plataforma multilateral de dos lados**, se construye un Value Proposition Canvas independiente para cada segmento de cliente:
- **`[V]` Viajero (*Traveler*):** quien conversa con el Agente (*Nomito*), reserva el alojamiento y **paga** la tarifa de servicio (*Service fee* del 7%) y la comisión de conversión (*FX fee* del ~1%).
- **`[D]` Dueño / Hotelero (*Owner*):** titular de cabañas, posadas o departamentos en el Norte Argentino (Jujuy, Salta, Cafayate) y resto de LATAM, que publica su alojamiento y **no paga nunca comisión ni suscripción** (0%).

> **Códigos globales de trazabilidad:**
> - `[V]` Viajero: Frustraciones `D1–D5` · Alegrías `A1–A5` · Aliviadores `AL1–AL5` · Creadores `CR1–CR5`
> - `[D]` Dueño: Frustraciones `D6–D10` · Alegrías `A6–A10` · Aliviadores `AL6–AL10` · Creadores `CR6–CR10`

---

## Segmento 1: `[V]` Viajero (*Traveler*)

**Persona concreta de referencia (en dos fases):**
- **Fase 1 — Validación y lanzamiento local (`ARS / wARS`):** Turista argentino (escapadas desde San Salvador de Jujuy, Salta Capital, Tucumán, Córdoba, Rosario y CABA hacia Tilcara, Purmamarca y Cafayate, que representan **>80% de la demanda anual del NOA**). Quiere pagar en pesos a tarifa directa de dueño sin sufrir las estafas de transferencias CBU por Instagram/WhatsApp ni pagar Airbnb en dólares (+30% ARCA) o Booking (+21% IVA).
- **Fase 2 — Expansión cross-border y tesis de Hackatón (`BRL / wBRL`, `CLP`, `USDC`):** Turista regional de Latinoamérica en ruta por el Norte Argentino —principalmente brasileño (mercado emisor extranjero N°1 con **+22% interanual en jul/2026** y ticket promedio hotelero de **USD 421**) o chileno/colombiano que paga desde su moneda local—.

### 1.1 Perfil del cliente (círculo)

#### Lo que tiene que hacer (trabajos del cliente / *Customer Jobs*)
1. **Funcional (principal):** Armar un itinerario de varios pueblos (ej. Salta → Cafayate → Purmamarca → Tilcara), comparar alojamientos independientes reales y dejarlos reservados y pagados antes de viajar.
2. **Funcional (pago transfronterizo):** Pagar el alojamiento en otro país de LATAM desde su propia moneda local (PIX en reales, transferencia en pesos) a tarifa directa de dueño sin sobreprecios de intermediarios.
3. **Funcional (coordinación):** Acordar con el dueño la hora de llegada, el acceso a la cabaña y dudas previas al viaje sin exponerse a estafas.
4. **Emocional:** Sentirse seguro de que al llegar después de horas de ruta la cabaña existe, lo están esperando y, si el viaje se cancela o el lugar no cumple, recupera su plata automáticamente sin pelear con un desconocido en otro país.
5. **Social:** Viajar bien recomendado ("reservar directo con dueños locales auténticos del Norte") pagando un precio justo.

#### Lo que le complica (frustraciones / *Pains*) — de mayor a menor importancia
- **`D1` — Sin garantía ni reembolso al pagar por transferencia CBU/Alias (en Argentina) o con links PIX simples como kamiPay (desde Brasil):** Para evitar el recargo de Booking/Airbnb, el dueño pide transferir una seña del 50% por CBU/Mercado Pago o un link PIX; pero en el turismo interno argentino las estafas de cabañas clonadas en Instagram/WhatsApp son epidemia y la transferencia CBU es irreversible, mientras que en pasarelas como **kamiPay** la plata va directo al hotel sin contrato de garantía (*Escrow*) que devuelva el dinero automáticamente si el viajero cancela en término o si el alojamiento no cumple (`docs/adr/0006-booking-escrow.md`).
- **`D2` — Sobreprecio e impuestos en OTAs tradicionales (15,5%–18% de comisión trasladada al precio + dólar tarjeta / IVA en Argentina o ~8% en tarjeta brasileña):** En Booking.com (15%–18%) o Airbnb (15,5% comisión única al anfitrión), el dueño infla la tarifa publicada para cubrir la comisión de la OTA. Encima, **el viajero argentino en Airbnb recibe el cargo en dólares en la tarjeta (+30% de percepción ARCA si no hace *stop debit* con dólares) y en Booking paga +21% de IVA**, mientras que el viajero brasileño paga **3,5% de IOF + ~4,5% de spread bancario (~8%)** en su tarjeta internacional `(datos de mercado 2026)`.
- **`D3` — Tiempo perdido comparando decenas de pestañas para rutas multi-destino:** Un viaje por la Quebrada de Humahuaca y los Valles Calchaquíes combina 3 o 4 pueblos chicos (Purmamarca, Tilcara, Cafayate, Salta); buscar disponibilidad real, precios en otra moneda y reglas en 15 pestañas lleva horas `(supuesto)`.
- **`D4` — Barrera cripto en alternativas con stablecoins:** Las billeteras Web3 exigen entender redes, tokens (`USDT`, `USDC`), gas (`CELO`) y firmas hexadecimales; al viajero común eso le genera desconfianza y abandona el pago (`docs/adr/0003-agent-wallet-per-traveler.md`).
- **`D5` — Reseñas dudosas y reglas de cancelación distintas en cada anuncio:** En portales o redes sociales hay reseñas de cuentas sin estadía verificada y cada anfitrión impone políticas de cancelación confusas (`docs/adr/0004` y `0008`).

#### Lo que quiere lograr (alegrías / *Gains*) — de mayor a menor importancia
- **`A1` — Reembolso automático e inmediato por contrato si cambia de planes o hay fraude (requerida):** Contar con una regla única y clara (100% de devolución del alquiler hasta 5 días antes del check-in, 50% después, y 24 h para reclamar al llegar) ejecutada por código sin depender de la buena voluntad del dueño.
- **`A2` — Pagar en su moneda local accediendo al precio directo del dueño (requerida):** Ver el precio final en su moneda (`R$ BRL` o `$ ARS`), transferir desde su banco/PIX y acceder a una tarifa directa sin el 15,5%–18% de recargo de las OTAs.
- **`A3` — Resolver búsqueda, comparación y reserva en una sola conversación (esperada):** Pedirle en lenguaje natural *"Buscame algo tranquilo en Cafayate y Tilcara del 15 al 20 para 2 personas"* y recibir 2–3 opciones disponibles con desglose listo para confirmar.
- **`A4` — Trato directo con el dueño sin entregar teléfono ni email personal antes de tiempo (deseada):** Coordinar llegada y consultas dentro de la misma reserva apenas se confirma.
- **`A5` — Construir reputación verificada como buen huésped (inesperada):** Que sus estadías cumplidas le den respaldo ante próximos dueños de la red sin exponer su perfil en público.

---

### 1.2 Mapa de valor para `[V]` Viajero (cuadrado)

#### Lo que ofrecemos (productos y servicios / *Products & Services*)
- **Contrato inteligente de garantía (*Escrow*, `contracts/Escrow.sol` + `keeper.ts`):** Retiene el 100% del alquiler al reservar y solo lo libera al dueño en 2 etapas (50% a 5 días del check-in; 50% a 24 h pos check-in si no hay reclamo).
- **Agente de viajes *Nomito* (`apps/agent` + `/app`):** Chat conversacional gratuito que busca alojamientos disponibles (`search_listings`), cotiza noche por noche (`quote_booking`), ejecuta el pago de la reserva (`book_listing`), cancela (`cancel_booking`) y abre reclamos (`open_claim`).
- **Billetera invisible del Viajero (*Agent wallet*, `apps/api/src/wallet.ts`):** Billetera en Celo derivada por viajero que muestra saldos únicamente en moneda local (`$ ARS`, `R$ BRL`), fondeada por rampa de Ripio y operada por *Nomito* con gas patrocinado vía x402.
- **Corredor cambiario wFIAT (`Ripio` + `Textile FX`):** Carga y retiro 1:1 sin costo de rampa en Celo (`wARS`, `wBRL`, `wCOP`, desplegados por Ripio en Celo en jul/2026) y conversión programable entre monedas locales (`docs/corredor-wfiat-pagos.html`, integración automática en progreso).
- **Mensajería por reserva (`booking_messages`) y Reseñas verificadas (`reviews`):** Hilo 1 a 1 con visto en tiempo real y reseñas exclusivas de estadías completadas con ponderación por antigüedad (36 meses).

#### Cómo se lo resolvemos (aliviadores de frustraciones / *Pain Relievers*)
- **`AL1` (alivia `D1` — diferencial central vs. kamiPay y WhatsApp):** El alquiler nunca va directo al bolsillo del dueño al pagar: queda custodiado en `Escrow.sol`, que ejecuta reembolsos inmediatos (100% >5d, 50% ≤5d) y protege las primeras 24 h del check-in ante reclamos (**Claims**).
- **`AL2` (alivia `D2`):** Permite reservar al precio directo del dueño (0% comisión al hotel, evitando el 15,5%–18% de sobreprecio de Airbnb/Booking) pagando en moneda local con rampa Ripio 0% + **FX fee (~1%)** + **Service fee (7%)**. *(Nota clave de mercado 2026: como el 8% total de Nomai empata con el ~8% de IOF 3,5% + spread de una tarjeta brasileña, el ahorro económico real proviene del menor precio base del dueño frente a las OTAs).*
- **`AL3` (alivia `D3`):** *Nomito* consulta inventario y disponibilidad real noche por noche (`GET /listings/search` y `/quote`) de forma gratuita para el viajero y arma una preselección (*shortlist*) comparable en segundos.
- **`AL4` (alivia `D4`):** Abstracción total de Web3 ([ADR-0003](../adr/0003-agent-wallet-per-traveler.md)): la interfaz solo muestra importes fiat (`$ 285.000 ARS`, `R$ 1.476,15 BRL`), el *Agent wallet* se crea solo cuando hace falta y el facilitador x402 patrocina el gas.
- **`AL5` (alivia `D5`):** Una única regla global de cancelación en toda la plataforma y reseñas que la base de datos rechaza si la reserva no está en estado `completed` ([ADR-0008](../adr/0008-two-sided-reviews.md)).

#### Cómo lo ayudamos a lograrlo (creadores de alegrías / *Gain Creators*)
- **`CR1` (crea `A1`):** Reembolso ejecutado en cadena por el *Escrow keeper* (`POST /bookings/:id/cancel` → `keeper.ts`) directo al *Agent wallet* del viajero, más ventana de 24 h desde el check-in para abrir un reclamo (**Claim**) con fotos si el alojamiento no existe o no coincide.
- **`CR2` (crea `A2`):** Tarjeta de cotización tipo *boarding pass* que desglosa antes de pagar: alquiler directo en moneda del dueño, tipo de cambio, *FX fee* y *Service fee* como líneas separadas.
- **`CR3` (crea `A3`):** Integración directa chat ↔ catálogo ("Pedirle a Nomito" desde `/lodgings` y `/owners/[slug]`) más servidor **MCP** (`POST /mcp` con OAuth 2.1) para consultar desde asistentes de IA externos.
- **`CR4` (crea `A4`):** Apertura automática del hilo de mensajes (**Thread**) con mensaje del sistema en el instante en que se confirma la reserva ([ADR-0009](../adr/0009-booking-messaging.md)), con alertas de no leídos y *visto* en tiempo real sin revelar WhatsApp ni email.
- **`CR5` (crea `A5`):** Puntaje de huésped (`traveler_score()`) calculado sobre reseñas `to_traveler` de dueños reales, privado y visible únicamente para los dueños que lo hospedan.

---

## Segmento 2: `[D]` Dueño / Hotelero (*Owner*)

**Persona concreta de referencia:** Dueño o encargado familiar de un complejo de 3 a 15 cabañas, posada o hostería en el Norte Argentino (Purmamarca, Tilcara, Humahuaca, Cafayate, Salta Capital), que enfrenta una ocupación promedio baja (**44% en Salta al cierre de 2025**) y necesita defender su margen en cada reserva.

### 2.1 Perfil del cliente (círculo)

#### Lo que tiene que hacer (trabajos del cliente / *Customer Jobs*)
1. **Funcional (ocupación):** Llenar las noches libres de sus cabañas o habitaciones en un mercado con 56% de capacidad ociosa promedio.
2. **Funcional (cobro a extranjeros):** Cerrar y cobrar reservas anticipadas a turistas de Brasil (+22% interanual), Chile o resto de LATAM recibiendo pesos argentinos en su banco sin perder comisión.
3. **Funcional (gestión diaria):** Publicar fotos, precios y ubicación de sus cabañas, responder dudas de llegada y calificar a los huéspedes.
4. **Emocional:** Tener certeza de que quien reservó ya pagó el 100% y que una cancelación de último momento no le deja la cabaña vacía gratis.
5. **Social:** Mostrar una vidriera (*Storefront*) propia y profesional con reseñas verificadas que dé confianza al turista extranjero que le escribe por Instagram o WhatsApp.

#### Lo que le complica (frustraciones / *Pains*) — de mayor a menor importancia
- **`D6` — Comisiones del 15,5% al 18% en OTAs tradicionales (Airbnb / Booking.com):** Airbnb unificó su comisión al anfitrión en **15,5%** y Booking.com retiene entre **15% y 18%** del ingreso bruto (`dato de mercado 2026`); con una ocupación del 44% en la región, ceder casi un sexto de la facturación ahoga la rentabilidad del dueño.
- **`D7` — Pérdida de consultas directas de extranjeros por falta de garantía en el cobro por WhatsApp:** Cuando un turista brasileño le escribe por Instagram o WhatsApp, no puede transferir a un CBU argentino; y si el dueño no usa kamiPay o si el turista desconfía de mandar USD 421 directo sin garantía de reembolso a una posada que no conoce, el turista vuelve a Booking/Airbnb o se cae la venta `(supuesto entrevista P5 + dato ticket kamiPay)`.
- **`D8` — Costos fijos en temporada baja:** Los motores de reserva o sistemas que cobran suscripción mensual fija castigan al hotelero en los meses de baja ocupación (`docs/adr/0001` y `0005`).
- **`D9` — "No-shows" y cancelaciones de último minuto sin compensación:** En reservas por WhatsApp con seña baja o a pagar en efectivo al llegar, si el turista cancela sobre la fecha o no aparece, el dueño pierde la estadía entera (`docs/adr/0006`).
- **`D10` — Desconocimiento técnico para cobrar en rieles digitales o cripto:** Un dueño de posada en Tilcara o Cafayate no quiere manejar frases semilla, redes blockchain ni contabilidad cripto compleja (`docs/adr/0001` y entrevista P3).

#### Lo que quiere lograr (alegrías / *Gains*) — de mayor a menor importancia
- **`A6` — Recibir el 100% del precio publicado en su moneda local (requerida):** "Cero comisión, siempre": si publica la noche a `$ 95.000 ARS`, cobra `$ 95.000 ARS` íntegros (u ofrece un 10% de descuento frente a su tarifa de Booking y aun así gana un 5,5%–8% más en mano).
- **`A7` — Cerrar en 2 minutos las consultas de extranjeros que llegan por Instagram/WhatsApp dándoles garantía (requerida):** Mandarles el link de su escaparate (`/owners/[slug]`) donde el extranjero paga en reales con protección de *Escrow* (venciendo el miedo a transferir a un desconocido) y al dueño se le acredita en pesos.
- **`A8` — Cobro asegurado ante cancelaciones sobre la fecha (esperada):** Recibir automáticamente el 50% del alquiler a los 5 días previos al check-in (y retener ese 50% si el huésped cancela tarde), y el 50% restante 24 h después del check-in.
- **`A9` — Saber de antemano cómo se comportó el huésped en otros alojamientos (deseada):** Ver el puntaje histórico del viajero en limpieza, comunicación y normas de la casa.
- **`A10` — Alta acompañada y verificación de cobro a prueba de errores (esperada):** Confirmar que su cuenta de Ripio recibe bien el dinero con una prueba real de centavos antes de recibir su primera reserva grande.

---

### 2.2 Mapa de valor para `[D]` Dueño (cuadrado)

#### Lo que ofrecemos (productos y servicios / *Products & Services*)
- **Escaparate público del Dueño (*Storefront*, `/owners/[slug]`):** Página propia con todos sus alojamientos, puntaje ponderado por antigüedad y checkout transfronterizo con garantía *Escrow*.
- **Panel de gestión de Dueño (`/app/lodgings`, `/owners/join`, `apps/api/src/owners.ts`):** Alta sin costo fijo, carga de fotos en Storage, geocodificación en mapa de cualquier localidad real, bandeja de mensajes (`/owners/inbox`) y panel de reseñas y pagos en *Escrow*.
- **Verificación empírica de dirección de cobro (`apps/api/src/payout.ts`):** Envío automático de un micro-depósito de prueba en `wFIAT` desde la billetera operativa de Nomai a la dirección de Ripio del dueño en Celo, que queda activa solo cuando el dueño confirma el monto exacto acreditado.
- **Liquidación escalonada por *Escrow* (`keeper.ts`) y rampa de salida Ripio:** Liberación automática en 2 tramos (50% a 5 días del check-in y 50% a 24 h del check-in) directo a la cuenta de Ripio del dueño, con retiro 1:1 gratis a su banco local.

#### Cómo se lo resolvemos (aliviadores de frustraciones / *Pain Relievers*)
- **`AL6` (alivia `D6`):** Modelo **0% comisión al Dueño** ([ADR-0005](../adr/0005-service-fee-replaces-credits.md)): ahorra el 15,5% de Airbnb y el 15%–18% de Booking.com en cada reserva.
- **`AL7` (alivia `D7`):** El Dueño comparte su link `/owners/[slug]` por WhatsApp/Instagram; el turista extranjero paga en su moneda local y la garantía del *Escrow* le da la confianza que una transferencia común o un link sin reembolso no le dan ([entrevista P5](entrevista.md)).
- **`AL8` (alivia `D8`):** Sin suscripción ni costo de mantenimiento: si un mes de temporada baja el dueño tiene 0 reservas, paga `$ 0`.
- **`AL9` (alivia `D9`):** No existen "reservas pendientes": toda reserva en Nomai exige el pago del 100% por adelantado (`book-payment.ts`), y si el viajero cancela dentro de los 5 días previos al check-in, el dueño cobra igual el 50% del alquiler ([ADR-0006](../adr/0006-booking-escrow.md)).
- **`AL10` (alivia `D10`):** El dueño nunca maneja frases semilla ni gas: usa su cuenta de Ripio (regulada como PSAV, con soporte local y salida a CBU/Mercado Pago), verificada con el micro-depósito guiado de `payout.ts` y acompañamiento presencial del equipo en Jujuy/Salta ([entrevista P3](entrevista.md)).

#### Cómo lo ayudamos a lograrlo (creadores de alegrías / *Gain Creators*)
- **`CR6` (crea `A6`):** Liquidación 1:1 en `wARS` (o el `wFIAT` del país del dueño) con rampa de retiro gratuita en Celo hacia su cuenta bancaria.
- **`CR7` (crea `A7`):** Escaparate público (`/owners/[slug]`) listo para pegar en la biografía de Instagram o responder por WhatsApp, más exposición gratuita en el agente *Nomito* y en el servidor MCP (`POST /mcp`).
- **`CR8` (crea `A8`):** Tablero de cobros que muestra en tiempo real qué monto está en *Escrow*, cuándo se libera el primer 50% (`first_release_at`) y cuándo el segundo 50% (`final_release_at`).
- **`CR9` (crea `A9`):** Acceso exclusivo al puntaje del huésped (`GET /owners/travelers/:id/score`) y posibilidad de responder públicamente cada reseña (`POST /owners/reviews/:id/reply`, [ADR-0008](../adr/0008-two-sided-reviews.md)).
- **`CR10` (crea `A10`):** Flujo de verificación `PUT /owners/payout-address` → `POST /owners/payout-address/test` → `POST /owners/payout-address/confirm` que impide que el *Escrow keeper* envíe plata a una dirección equivocada (mantiene los fondos en `held` hasta verificar).

---

## 3. Tabla de encaje (*Fit*)

| Segmento | Frustración / alegría del cliente | Importancia | Aliviador / creador | Producto que lo entrega | Evidencia |
|---|---|---|---|---|---|
| `[V]` Viajero | `D1` / `A1`: Miedo a pagar directo por WhatsApp/PIX sin garantía de reembolso si cancela o hay estafa | Alta | `AL1` / `CR1`: Custodia en contrato *Escrow* con reembolso automático 100% (>5d) / 50% (≤5d) y *Claims* 24 h | `contracts/Escrow.sol` + `keeper.ts` + `cancellations.ts` (funcionando y testeado en ganache) | **Diferencial real frente a kamiPay y CBU**; falta validar conversión en calle `(supuesto)` |
| `[V]` Viajero | `D2` / `A2`: Pagar en su moneda local a precio directo del dueño (sin el 15,5%–18% de sobreprecio OTA) | Alta | `AL2` / `CR2`: Corredor wFIAT (Ripio 0% rampa + FX ~1% + Service fee 7%) sobre tarifa directa 0% comisión al dueño | Rampa Ripio + `quote_booking` + `book-payment.ts` (swap automático Textile FX en roadmap) | **Dato 2026**: IOF BR 3,5% + spread ≈ 8% (empata con el 8% de Nomai; el ahorro exige que el dueño publique precio directo menor que en OTAs) |
| `[V]` Viajero | `D3` / `A3`: Armar ruta multi-pueblo sin abrir 15 pestañas | Media | `AL3` / `CR3`: Búsqueda conversacional gratuita con *Nomito* y servidor MCP | `apps/agent` + `apps/web` (`/app`) + `mcp.ts` | **Supuesto** |
| `[V]` Viajero | `D4`: Rechazo a usar billeteras cripto, tokens y gas | Alta | `AL4`: *Agent wallet* invisible, saldos en fiat y gas patrocinado por facilitador x402 | `wallet.ts` + facilitador Celo x402 | **Decisión de diseño** ([ADR-0003](../adr/0003-agent-wallet-per-traveler.md)); hoy el viajero aún pasa por la rampa Ripio al cargar saldo |
| `[V]` Viajero | `D5` / `A4` / `A5`: Reseñas falsas, reglas confusas y coordinación sin dar el teléfono | Media | `AL5` / `CR4` / `CR5`: Política única de cancelación, reseñas atadas a estadías `completed` e hilo privado 1 a 1 | Migraciones de `reviews` y `booking_messages` ([ADR-0008](../adr/0008-two-sided-reviews.md), [ADR-0009](../adr/0009-booking-messaging.md)) | **Supuesto** |
| `[D]` Dueño | `D6` / `A6`: Perder 15,5% (Airbnb) o 15%–18% (Booking) con ocupación de apenas 44% | Alta | `AL6` / `CR6`: 0% comisión al dueño, cobro 100% íntegro en su moneda vía Ripio | `service-fee.ts` (cobra solo al viajero) + `payout.ts` | **Dato 2026** (Airbnb 15,5%, Booking 15–18%, ocupación Salta 44%) |
| `[D]` Dueño | `D7` / `A7`: Cerrar consultas de turistas brasileños (+22% YoY) por WhatsApp con garantía que destrabe el pago del 100% | Alta | `AL7` / `CR7`: Escaparate `/owners/[slug]` como link de reserva internacional con garantía *Escrow* | `/owners/[slug]` + `book-payment.ts` | **Supuesto clave** ([entrevista P5](entrevista.md)) |
| `[D]` Dueño | `D8` / `D9` / `A8`: Costos fijos en temporada baja y cancelaciones de último momento | Media | `AL8` / `AL9` / `CR8`: $0 costo fijo mensual, pago 100% por adelantado y 50% liberado 5 días antes | `Escrow.sol` + `keeper.ts` | **Supuesto** |
| `[D]` Dueño | `D10` / `A9` / `A10`: Miedo a equivocarse con cuentas digitales o recibir malos huéspedes | Media | `AL10` / `CR9` / `CR10`: Micro-depósito de verificación + alta presencial en Jujuy/Salta + puntaje de huésped | `payout.ts` + `traveler_score()` | **Supuesto** ([entrevista P3](entrevista.md)) |

### Huecos detectados en el encaje actual
1. **Hueco en `[D]` Dueño (sincronización de disponibilidad):** Un dueño real vende a la vez por WhatsApp y Booking.com. Hoy en Nomai **no puede bloquear noches manualmente** (`GLOSSARY.md`: *"Owners can't block nights"*), lo que genera riesgo de sobreventa (*overbooking*).
2. **Hueco en `[V]` Viajero (conversión automática en el pago):** La promesa para el turista brasileño que reserva una cabaña en Cafayate cotizada en `ARS` requiere el swap automático `wBRL → wARS`. Hoy `book-payment.ts` exige pagar en la misma moneda del alojamiento (`wARS`), por lo que falta conectar el swap de Textile FX dentro del flujo de reserva.

### Nivel de encaje actual (según Osterwalder)
- **Nivel 1 — Encaje Problema–Solución (en prototipo funcional):** La infraestructura es real y madura (wFIAT de Ripio en Celo desde jul/2026, x402 en la Linux Foundation, `Escrow.sol` y `keeper.ts` funcionando), pero aún no se ejecutaron las entrevistas de campo ni las primeras reservas reales con dueños de Jujuy/Salta ([entrevista P1](entrevista.md)).

---

## 4. Declaraciones de propuesta de valor

- **Para el `[V]` Viajero (*Traveler*):**
  > **Nomai** (con su agente **Nomito**) ayuda al **viajero regional de Latinoamérica** que quiere **reservar alojamientos auténticos en el Norte Argentino y LATAM** eliminando **el riesgo de mandar pagos directos sin reembolso por WhatsApp y el sobreprecio del 15,5%–18% de las OTAs tradicionales (`D1`, `D2`)**, y logrando **pagar desde su moneda local con el 100% de su dinero protegido en un contrato de garantía (*Escrow*) con reembolso automático 100%/50% (`A1`, `A2`)**, a diferencia de **kamiPay o las transferencias bancarias (que no tienen garantía ni reembolso si cancelás) y de Booking/Airbnb (que inflan el precio con comisiones y recargos de tarjeta)**.

- **Para el `[D]` Dueño (*Owner*):**
  > **Nomai** ayuda al **dueño de cabañas, posadas y alojamientos independientes en Jujuy, Salta y LATAM** que quiere **convertir consultas directas de turistas extranjeros y nacionales** eliminando **el 15,5%–18% de comisión de Airbnb/Booking y la desconfianza del turista extranjero a pagar el 100% por adelantado por WhatsApp (`D6`, `D7`)**, y logrando **recibir el 100% de su tarifa en pesos en su banco con cobro adelantado protegido ante cancelaciones tardías (`A6`, `A8`)**, a diferencia de **Airbnb/Booking (que se quedan con hasta un sexto de la venta) o las señas informales sin garantía**.
