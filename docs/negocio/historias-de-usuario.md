# Historias de usuario del negocio — nomai

> **Nota metodológica:** Los nombres y personajes de este documento (*Lucas*, viajero de Florianópolis, y *Valentina*, dueña de posada en Cafayate) son **ejemplos ilustrativos** basados en el escenario oficial de demostración del repositorio (`docs/design/traveler-views.md` §4 y `supabase/seed.sql`), no clientes reales entrevistados. Cada paso indica entre corchetes el código del Value Proposition Canvas (`AL1–AL10`, `CR1–CR10`) que lo respalda.

---

## HU1 — El Viajero regional investiga, accede al precio directo del dueño y reserva con garantía Escrow (`[V]` *Traveler*, segmento que paga)

### 1. La historia contada

- **Martes, 20:15 — La consulta inicial y el precio directo frente a las OTAs (`AL2`, `AL3`, `CR3`, `CR7`):**
  Lucas vive en Florianópolis (Brasil) y planea recorrer Salta, Cafayate y Tilcara en auto con su pareja. En Booking.com ve *Casa de Adobe* en Cafayate a `$ 335.000 ARS` las 3 noches (inflada por el 15%–18% de comisión de la OTA). Le escribe por Instagram a Valentina (la dueña), quien le responde con el link a su escaparate en Nomai (`/owners/hospedajes-andinos`, `AL7`, `CR7`), donde las mismas 3 noches están publicadas a tarifa directa de `$ 285.000 ARS` (`AL2`). Desde ahí, Lucas toca **"Pedirle a Nomito"** y entra al chat en `/app` (`CR3`), donde también le pide a **Nomito** comparar opciones para 2 noches más en Tilcara sin pagar por buscar (`AL3`).
- **Martes, 20:22 — Cotización transparente en reales y garantía frente a un giro sin retorno (`AL1`, `AL2`, `AL4`, `CR2`):**
  Lucas dudaría en girar USD 300–420 por un link de pago directo (como kamiPay o transferencia) sin saber si le devolverán la plata si cancela. En cambio, **Nomito** le muestra la tarjeta de cotización estilo *boarding pass* con las reglas del **Escrow** (`AL1`) y el desglose en reales: alquiler directo (`$ 285.000 ARS`), tipo de cambio (`1 BRL = 195 ARS`), comisión de conversión (`FX fee` ~1%, `R$ 14,60`) y tarifa de servicio (`Service fee` 7%, `$ 19.950 ARS`) en líneas separadas (`CR2`). No ve palabras como *wARS*, *Celo* ni *gas* (`AL4`). Toca **"Cargar saldo"**, transfiere reales por PIX en la rampa de Ripio y ve acreditado su saldo en `R$ BRL` (`AL2`, `AL4`).
- **Martes, 20:28 — Pago instantáneo a la garantía Escrow y apertura del canal con la dueña (`AL1`, `AL5`, `CR1`, `CR4`):**
  Lucas confirma la reserva (verificando su documento de identidad). Detrás de escena, **Nomito** convierte los fondos a la moneda del alojamiento, ejecuta el pago x402 con gas patrocinado y deposita el 100% del alquiler (`$ 285.000 ARS`) en el contrato de **Escrow**, mientras el 7% de *Service fee* va a Nomai (`AL1`). En el mismo segundo se abre el hilo privado de mensajes (**Thread**) dentro de la reserva con el aviso *"Reserva recibida — ya podés coordinar los detalles con tu anfitrión"*, donde Lucas avisa que llegará a las 16:00 sin revelar su teléfono personal (`CR4`).
- **Tres semanas después (estadía y posventa — `CR1`, `CR5`):**
  Cinco días antes del check-in se vence el plazo de cancelación gratuita (`AL5`) y el **Escrow** libera automáticamente el primer 50% a Valentina. Lucas hace el check-in en Cafayate; como todo coincide con las fotos, no abre ningún reclamo (**Claim**) en las primeras 24 horas y el **Escrow** libera el 50% restante (`CR1`). Al terminar el viaje, dentro de los 14 días posteriores al check-out, Lucas deja su reseña pública verificada (`to_lodging`) y recibe de Valentina una calificación privada de buen huésped que le suma reputación para su próxima parada en Tilcara (`CR5`).
- **Lo que el producto NO hace:**
  Nomai **no** vende pasajes aéreos ni alquiler de autos, **no** permite reservar sin pagar el 100% por adelantado (no existen reservas "a pagar en efectivo al llegar") y **no** devuelve el 7% de *Service fee* si Lucas decide cancelar su viaje.

### 2. Formato de historia de usuario

> **Como** viajero regional de Latinoamérica (`[V]` *Traveler*), **quiero** buscar alojamientos con **Nomito** y pagar la reserva desde mi moneda local a tarifa directa de dueño con el dinero resguardado en garantía hasta mi llegada, **para** evitar el sobreprecio del 15,5%–18% de las OTAs y asegurarme el reembolso automático 100%/50% que una transferencia o link PIX directo no me da.

### 3. Criterios de aceptación

1. **Dado** que un viajero conversa con **Nomito** en `/app` o explora `/lodgings`, **cuando** pide opciones para fechas y cantidad de huéspedes, **entonces** recibe alojamientos con disponibilidad real noche por noche sin ningún cobro por buscar (dentro de los límites diarios anti-abuso de `usage.ts`).
2. **Dado** que el viajero pide cotizar una estadía (`GET /listings/:slug/quote`), **cuando** visualiza el resumen antes de pagar, **entonces** ve por separado el monto del alquiler, la tarifa de servicio (`7%`), la comisión de conversión (si aplica) y la regla única de cancelación (100% hasta 5 días antes del check-in, 50% después).
3. **Dado** que el viajero confirma la reserva (`POST /listings/:slug/book`), **cuando** su *Agent wallet* firma la autorización x402, **entonces** el alquiler se liquida en el contrato `Escrow.sol` sin cobrarle gas al viajero, las noches quedan descontadas del inventario y se crea automáticamente el hilo de mensajes (`booking_messages`).
4. **Dado** que el viajero cancela la reserva antes del check-in (`POST /bookings/:id/cancel`), **cuando** faltan más de 5 días para el check-in, **entonces** el *Escrow keeper* le transfiere de vuelta el 100% del alquiler a su *Agent wallet* (o el 50% si faltan 5 días o menos), reteniendo el *Service fee*.
5. **Dado** que la reserva pasa a estado `completed`, **cuando** transcurren menos de 14 días desde el check-out, **entonces** el viajero puede publicar exactamente una reseña (`to_lodging`) que impacta en el puntaje ponderado por antigüedad del alojamiento.

### 4. Estado actual en el código (`[hoy]` vs. `[roadmap]`)

| Paso del recorrido | Código VPC | Estado | Dónde está en el repo / Qué falta | Hipótesis asociada (`hipotesis.md`) |
|---|---|---|---|---|
| Búsqueda y cotización con desglose de *Service fee* (7%) | `AL3`, `CR2`, `CR3` | **[hoy]** | `apps/api/src/listings.ts`, `service-fee.ts`, `apps/agent/agent/tools/` | `H2` (conversión real en link del dueño con tarifa directa) |
| Creación automática de *Agent wallet* y pago x402 con gas patrocinado hacia `Escrow.sol` (incluyendo el flujo completo en pesos `wARS → Escrow.sol → wARS` para **Fase 1: Viajero argentino/regional**) | `AL1`, `AL4` | **[hoy]** | `apps/api/src/wallet.ts`, `book-payment.ts`, `contracts/Escrow.sol` (`smoke:book` liquidando en `wARS` operativo al 100% hoy) | `H2`, `H3` (validación inmediata en Jujuy/Salta con viajeros argentinos en `ARS`) |
| Conversión automática `wBRL → wARS` en el mismo acto de reservar (**Fase 2: Viajero brasileño/extranjero**) | `AL2`, `CR2` | **[roadmap]** | Diseñado en `docs/corredor-wfiat-pagos.html`; hoy `book-payment.ts` (líneas 113–117) exige que el *Agent wallet* ya tenga el `wFIAT` de la moneda del alojamiento (`wARS`) | `H4` (integración B2B con Textile FX y Ripio para expansión cross-border) |
| Rampa de carga de saldo embebida sin salir a una pestaña externa de Ripio | `AL2`, `AL4` | **[roadmap]** | Hoy el flujo abre deep link a Ripio (`traveler-views.md` §7); falta integrar Ripio Ramps API B2B | `H3`, `H4` |
| Cancelación 100%/50%, reclamos (*Claims* 24 h) y liberación en 2 tramos por *keeper* | `AL1`, `AL5`, `CR1` | **[hoy]** | `apps/api/src/cancellations.ts`, `keeper.ts` (`smoke:keeper` pasando) | `H2` |
| Hilo de mensajes 1 a 1 en tiempo real y reseñas verificadas de 2 lados | `CR4`, `CR5` | **[hoy]** | Migraciones y rutas de `booking_messages` y `reviews` (`ADR-0008`, `ADR-0009`) | — |

---

## HU2 — El Dueño en Jujuy/Salta convierte una consulta de WhatsApp en reserva pagada al 100% con 0% comisión (`[D]` *Owner*, lado subsidiado)

### 1. La historia contada

- **Lunes, 11:00 — Alta acompañada y prueba de centavos en Ripio (`AL6`, `AL8`, `AL10`, `CR10`):**
  Valentina administra 4 cabañas en Cafayate en una provincia con 44% de ocupación promedio. Un integrante del equipo de Nomai la visita y le muestra que publicar en Nomai cuesta `$ 0` por mes y `0%` de comisión por venta, frente al 15,5% de Airbnb y el 15%–18% de Booking (`AL6`, `AL8`). En `/owners/join`, Valentina sube las fotos de sus cabañas (publicando un 10% menos que en Booking para atraer reservas directas y aun así ganar más), marca la ubicación en el mapa y pega su dirección de depósito de Ripio en la red Celo. El sistema le envía un micro-depósito de prueba en `wARS` (`payout.ts`); Valentina confirma cuántos centavos llegaron en su app de Ripio y su cuenta queda verificada (`AL10`, `CR10`).
- **Martes, 20:10 — De la consulta por Instagram al cierre con garantía (`AL7`, `AL9`, `CR7`):**
  Cuando Lucas (desde Brasil) le consulta por WhatsApp si tiene lugar del 15 al 18, Valentina le responde con el link a su escaparate `/owners/hospedajes-andinos` (`AL7`, `CR7`). A diferencia de un link de cobro común donde el extranjero teme girar USD 300–420 sin respaldo, la garantía del **Escrow** convence a Lucas y quince minutos después la reserva aparece como **Confirmada** con el 100% del alquiler (`$ 285.000 ARS`) depositado en custodia (`AL9`).
- **Coordinación, cobro en dos tramos y calificación del huésped (`CR6`, `CR8`, `CR9`):**
  Valentina entra a `/owners/inbox`, ve el puntaje previo de Lucas como huésped (`CR9`) y coordina el ingreso. Cinco días antes del check-in, el *Escrow keeper* le transfiere automáticamente el primer 50% (`$ 142.500 ARS`) a su cuenta de Ripio; 24 horas después del check-in le transfiere los `$ 142.500 ARS` restantes (`CR8`), que Valentina retira 1 a 1 sin comisión a su CBU bancario (`CR6`).
- **Hallazgo operativo importante (`[roadmap]`):**
  Si el miércoles entra una pareja caminando y le alquila una cabaña en efectivo por el fin de semana, hoy Valentina **no tiene un botón para bloquear esas noches sueltas** en Nomai (`GLOSSARY.md`: *"Owners can't block nights"*), lo que debe resolverse antes de operar en producción (`H5`).

### 2. Formato de historia de usuario

> **Como** dueño de cabañas o posada en el Norte Argentino (`[D]` *Owner*), **quiero** compartir mi escaparate en Nomai a los turistas extranjeros y nacionales para que reserven pagando el 100% por adelantado en garantía sin que me descuenten el 15,5%–18% de comisión, **para** cobrar íntegro mi precio en pesos en mi banco y protegerme de cancelaciones de último momento.

### 3. Estado actual para el Dueño (`[hoy]` vs. `[roadmap]`)

| Paso del recorrido del Dueño | Código VPC | Estado | Dónde está en el repo / Qué falta | Hipótesis asociada (`hipotesis.md`) |
|---|---|---|---|---|
| Alta de alojamiento, fotos, geocodificación y escaparate `/owners/[slug]` | `AL6`, `AL8`, `CR7` | **[hoy]** | `apps/api/src/owners.ts`, `apps/web` (`/owners/[slug]`, `/owners/join`) | `H1` (interés real de dueños de Jujuy/Salta) |
| Verificación de dirección de cobro en Ripio por micro-depósito | `AL10`, `CR10` | **[hoy]** | `apps/api/src/payout.ts` (`smoke:payout` pasando) | `H1` (disposición del dueño a abrir Ripio con ayuda) |
| Liberación automática 50% (-5d) y 50% (+24h) desde el *Escrow* | `AL9`, `CR6`, `CR8` | **[hoy]** | `apps/api/src/keeper.ts` + `contracts/Escrow.sol` | — |
| Bloqueo manual de fechas ocupadas por WhatsApp/Booking o sincronización iCal | Hueco VPC `[D]` | **[roadmap]** | Hoy prohibido por diseño (`GLOSSARY.md`: *"Owners can't block nights"*); indispensable para operar con posadas reales que venden por varios canales | `H5` (operación multicanal sin sobreventa) |
