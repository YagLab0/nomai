# Entrevista de negocio y contexto de mercado — nomai

- **Fecha:** 2026-11-03
- **Quién respondió:** Equipo fundador de **nomai** (Jujuy, Argentina) + relevamiento de datos de mercado 2026.
- **Método:** Entrevista estructurada previo al armado del Value Proposition Canvas y Business Model Canvas (método Alex Osterwalder / *The Mom Test*), contrastada contra el código del repositorio y datos macroeconómicos/competitivos vigentes en 2026.

---

## 1. Lo que se confirmó del repositorio (datos de diseño y código)

1. **Producto:** Plataforma bilateral de turismo para Latinoamérica con un agente de IA (**Nomito**, el loro alisero de las Yungas) que investiga opciones y ejecuta reservas (**Bookings**) de alojamientos (**Lodgings**), liquidando en stablecoins locales de Ripio (**wFIAT**: `wARS`, `wBRL`, `wCOP`, `wCLP`, `wMXN`, `wPEN`) sobre la red **Celo** mediante el protocolo **x402** hacia un contrato inteligente de garantía (`contracts/Escrow.sol`).
2. **Abstracción de Web3 ([ADR-0003](../adr/0003-agent-wallet-per-traveler.md)):** Ni el **Traveler** (viajero) ni el **Owner** (dueño/hotelero) ven vocabulario cripto, direcciones `0x` en público, firmas ni gas (el facilitador x402 de Celo patrocina el gas del pago y la plataforma paga el gas sub-centavo de las liberaciones desde el Escrow).
3. **Modelo de ingresos ([ADR-0005](../adr/0005-service-fee-replaces-credits.md)):**
   - **Tarifa de servicio (*Service fee*):** porcentaje fijo sobre el alquiler cobrado al **Traveler** en cada **Booking** (configurado hoy en **7%** en `platform_settings.service_fee_pct`, ver `apps/api/src/data/service-fee.ts`). Cubre los costos de inferencia del Agente, que es gratuito para explorar. No se reembolsa en caso de cancelación. Se retiraron las *monedas Nomai* (Credits).
   - **Comisión de conversión (*FX fee*):** porcentaje cobrado cuando el Agente convierte entre monedas (ej. `wBRL → wARS` vía **Textile FX**; modelado en ~**1,0%** en `traveler-views.md` §4 y ~**0,5%** en `corredor-wfiat-pagos.html`).
   - **El Owner no paga nunca:** 0% de comisión por reserva, $0 de suscripción mensual.
4. **Custodia y reglas de liberación ([ADR-0004](../adr/0004-traveler-initiated-cancellation.md), [ADR-0006](../adr/0006-booking-escrow.md)):**
   - El monto del alquiler va al contrato **Escrow** (`apps/api/src/keeper.ts`).
   - Se libera al **Owner** en dos tramos: **50% a los 5 días antes del check-in** (cuando vence el plazo de cancelación al 100%) y **50% a las 24 h después del check-in** si el viajero no abrió un reclamo (**Claim**).
   - **Cancelación (solo por el Traveler):** 100% de reembolso del alquiler hasta 5 días antes del check-in; 50% después.
5. **Reputación y mensajería ([ADR-0008](../adr/0008-two-sided-reviews.md), [ADR-0009](../adr/0009-booking-messaging.md)):**
   - Reseñas (**Reviews**) de dos lados atadas 1 a 1 a reservas completadas (ventana de 14 días pos check-out, publicación inmediata, puntaje ponderado por antigüedad con decaimiento a 36 meses; el puntaje del viajero solo lo ven dueños que lo hospedaron).
   - Hilo de mensajes (**Thread**) privado 1 a 1 por reserva (`booking_messages`) con confirmación de lectura (*visto*) en tiempo real.

---

## 2. Preguntas y respuestas de la entrevista al equipo

### Pregunta 1 — Objetivo del proyecto y validación actual en la calle
- **Pregunta:** El proyecto se armó en el marco del hackathon *Agents on Open Rails* con foco en el norte argentino y el corredor LATAM, pero hoy los 24 alojamientos son datos semilla (`seed.sql`). ¿En qué situación están hoy?
- **Respuesta del equipo:** *"Nació para el hackathon Agents on Open Rails, pero queremos lanzarlo como producto real en el norte argentino (Jujuy/Salta) sin haber entrevistado dueños aún."*
- **Clasificación:** **Opinión del equipo / decisión estratégica** (sin validación de campo aún → las hipótesis de conversión quedan marcadas como `(supuesto)`).

### Pregunta 2 — El huevo y la gallina (qué lado destrabar primero)
- **Pregunta:** Al ser una plataforma de dos lados y como el equipo es de Jujuy, ¿cómo piensan conseguir el primer lado de la plataforma?
- **Respuesta del equipo:** *"Empezar por el lado Dueño (Owner): conseguir 10–20 cabañas/posadas en Jujuy y Salta por contacto directo o visita presencial, porque el equipo es de Jujuy."*
- **Clasificación:** **Opinión del equipo / plan de ataque** `(supuesto)`.

### Pregunta 3 — Fricción real del Dueño en Jujuy/Salta (alta en Ripio y calendario)
- **Pregunta:** Un dueño de cabañas en Tilcara o Cafayate hoy cobra por CBU/Mercado Pago y vende por Booking.com y WhatsApp. En el código actual tienen dos trabas operativas: (1) el dueño debe abrir cuenta en Ripio y verificar su dirección en Celo (`payout.ts`), y (2) el dueño hoy no puede bloquear noches sueltas si vende por WhatsApp/Booking (`GLOSSARY.md`: *"Owners can't block nights"*). ¿Cómo planean resolverlo?
- **Respuesta del equipo:** *"Yo optaría por el acompañamiento presencial, pero primero dime: ¿solo el dueño tendría que tener la cuenta de Ripio para que todo funcione, no?"* (Se aclaró que hoy el viajero también pasa por el link de la rampa de Ripio al cargar saldo a su *Agent wallet*, salvo integración de rampa embebida/API B2B).
- **Clasificación:** **Opinión del equipo** `(supuesto)` + **hallazgo de fricción de producto** en ambos lados del corredor Ripio y en el bloqueo de disponibilidad.

### Pregunta 4 — El primer Viajero que paga el 7% de Service fee (ajuste táctico Fase 1 vs. Fase 2)
- **Pregunta:** Si empiezan con 10–20 cabañas en Jujuy y Salta (precios en ARS), ¿apuntan primero al turista extranjero de LATAM (ej. brasileños/chilenos pagando en BRL/CLP) o al turista doméstico argentino (ARS→ARS)?
- **Respuesta inicial y ajuste del equipo:** Inicialmente se pensó arrancar por turistas brasileños/chilenos (`BRL`/`CLP`), pero al evaluar la fricción de reclutar brasileños para entrevistas de campo se decidió **dividir el lanzamiento en dos fases**:
  - **Fase 1 (Validación inmediata en calle — Mercado doméstico/regional en `ARS / wARS`):** Probar primero con **viajeros argentinos y del propio NOA** (Jujuy, Salta, Tucumán, Córdoba, CABA) que viajan a la Quebrada y los Valles (>80% de la demanda anual). Pagan en pesos (`wARS → Escrow.sol → wARS`, flujo que **ya funciona al 100% hoy en código** sin necesitar swap FX), dejan el **7% de *Service fee*** (~90% de margen bruto) y resuelven un dolor local masivo: **evitar las estafas de señas por CBU/WhatsApp y evitar el dólar tarjeta (+30% percepción ARCA) y el +21% de IVA de Airbnb/Booking**.
  - **Fase 2 (Tesis de Hackatón y Expansión Cross-Border — `BRL / wBRL`, `CLP`, `USDC`):** Con el embudo local validado y el swap `wBRL → wARS` conectado, capturar al turista brasileño (+22% YoY, ticket USD 421) y regional (chilenos, mexicanos y usuarios `USDC`/`USDT` donde PIX/kamiPay no llega), sumando el **~1% de *FX fee*** (8% total).
- **Clasificación:** **Decisión estratégica de go-to-market** `(supuesto a validar en calle)`.

### Pregunta 5 — Cómo llegar a los primeros Viajeros sin gastar en anuncios caros
- **Pregunta:** Captar viajeros desde cero con anuncios es caro, mientras que las posadas de Cafayate, Purmamarca o Tilcara ya reciben decenas de consultas directas por WhatsApp/Instagram cada semana. ¿Cómo piensan conseguir las primeras reservas?
- **Respuesta del equipo:** *"Que los mismos dueños de Jujuy/Salta desvíen a sus consultas de WhatsApp/Instagram (primero argentinos/regionales en Fase 1 y extranjeros en Fase 2) al link de su escaparate en Nomai (`/owners/[slug]`) para cobrarles con garantía Escrow y 0% comisión para el dueño."*
- **Clasificación:** **Opinión del equipo** `(supuesto)`.

### Pregunta 6 — Precios, costos, dependencias B2B y rentabilidad del Escrow aislado
- **Pregunta:** ¿Confirman el 7% de *Service fee* + ~1% de *FX fee*, autofinanciación inicial y la necesidad de cerrar acuerdo B2B con Ripio y Textile FX para operar en mainnet post-hackathon?
- **Respuesta del equipo:** *"Es la primera [confirmar 7% Service fee + 1% FX fee y buscar el acuerdo con Ripio/Textile FX], pero después plantearemos si usar el Escrow por sí solo sería rentable, que no lo creo. Aun así intentaremos conseguir esto con Ripio para ofrecer los pagos automáticos y tal."*
- **Clasificación:** **Opinión del equipo** `(supuesto)`.

---

## 3. Datos de mercado verificados en 2026 que corrigen supuestos previos del repositorio

El cruce de la entrevista con el relevamiento de mercado de 2026 arroja **5 datos verificables** que obligan a actualizar el planteo original de `ADR-0001`:

1. **El diferencial real es la Garantía Escrow + Tarifa Directa (tanto en Argentina como en Brasil) (`dato 2026`):**
   - **En el mercado doméstico argentino (Fase 1 — >80% del volumen del NOA):** Hoy el viajero argentino que sube a Tilcara, Purmamarca o Cafayate elige entre dos malas opciones: **(a)** reservar en Airbnb (que factura en **USD en tarjeta y dispara el 30% de percepción de ARCA** si no se hace *stop debit* con dólares) o Booking (+21% IVA y precio inflado un 15%–18%), o **(b)** transferir una seña del 50% por CBU/Alias en WhatsApp/Instagram **sin ninguna garantía** (exponiéndose a la epidemia de estafas de cabañas clonadas en redes o a perder la seña si cancela). En este mercado, pagar en pesos (`wARS`) con **7% de *Service fee*** sobre la tarifa directa del dueño es **10%–18% más barato que Airbnb/Booking** y ofrece la protección del contrato `Escrow.sol` que el CBU no tiene. Además, **`wARS → Escrow.sol → wARS` ya funciona hoy al 100% en el código** (`book-payment.ts`).
   - **En el corredor Brasil → Argentina (Fase 2 — +22% interanual en jul/2026):** El Impuesto PAÍS venció en 2024 (brecha oficial/blue ~2,3%) y el **IOF de tarjeta internacional brasileña quedó en 3,5%** (+ ~4,5% de spread = **~8% total**), lo que empata con el **8% total de Nomai** (7% *Service fee* + 1% *FX fee*). Por lo tanto, también para el brasileño el ahorro económico proviene de acceder al **precio directo del dueño (10%–12% menor que en OTAs)** y el diferencial decisivo es **la custodia en *Escrow***.
2. **Competidor directo en el corredor PIX → Hoteles argentinos: `kamiPay` (`dato 2026`):**
   - **kamiPay** (fintech argentina con +25M de transacciones y ticket promedio hotelero de **USD 421**) permite a hoteles argentinos cobrar a turistas brasileños en reales vía **PIX** con **0% de abono fijo** liquidando en ARS, USD o USDT.
   - **Límites de kamiPay (oportunidad de Nomai):** (1) **Solo resuelve PIX de Brasil** (no resuelve turistas argentinos buscando garantía, ni chilenos `wCLP`, colombianos `wCOP`, mexicanos `wMXN` o viajeros cripto con `USDC`/`USDT`); (2) **Es un pago directo irreversible sin contrato de *Escrow*** (sin reembolso automático 100%/50% ni arbitraje de reclamos **Claims** en 24 h); y (3) **No tiene catálogo, ni agente buscador *Nomito*, ni servidor MCP**.
3. **El argumento "0% comisión al dueño" se fortaleció en 2026 (`dato 2026`):**
   - **Airbnb** migró al esquema de comisión única al anfitrión del **15,5%** y **Booking.com** cobra entre **15% y 18%**, mientras que Salta cerró 2025 con apenas **44% de ocupación hotelera**. En un mercado con baja ocupación y comisiones de OTAs en máximos, el "0% al dueño siempre" es un imán real de reclutamiento.
4. **Economía unitaria excelente, pero escala exigente (`estimación con cuenta`):**
   - Cada reserva deja un margen bruto del **85%–95%** (ingreso del 8% sobre tickets de USD 250–420 ≈ USD 20–33 por reserva, contra costos variables de ~USD 0,50–2,00 entre LLM, RPC y gas sub-centavo).
   - **Pero** con 15 cabañas en el piloto de Jujuy/Salta (a 44% de ocupación y captando la porción directa/extranjera), el volumen proyectado es de apenas **~22 reservas/mes** (~USD 450–650/mes de ingreso bruto). El **punto de equilibrio (*break-even*) exige entre 120 y 400 reservas mensuales** según la estructura de costos fijos del equipo, lo que requiere escalar de las 15 cabañas iniciales a **100–600 propiedades**.
5. **Madurez de la infraestructura y encuadre regulatorio PSAV (`dato 2026`):**
   - **Ripio** desplegó el paquete completo de `wFIAT` en Celo mainnet (jul/2026) y el protocolo **x402** pasó a la **Linux Foundation** (con Visa, Mastercard y Stripe como miembros).
   - En Argentina, el régimen de **PSAV (Proveedores de Servicios de Activos Virtuales)** de la CNV es navegable siempre que el KYC y el cambio fiat ↔ cripto ocurran del lado de Ripio (ya regulado) y el contrato `Escrow.sol` de Nomai se mantenga no-custodial (el rol de árbitro solo puede liberar al Dueño o reembolsar al Viajero de esa reserva, nunca retirar fondos para sí).
