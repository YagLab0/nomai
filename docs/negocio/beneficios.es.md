# Documento de beneficios (i18n) — Español (`es`)

<!-- nota-traduccion: Mantener los IDs benefit.* intactos en todos los idiomas. Localizar el formato numérico y de moneda según la convención de cada idioma (ej. 7 %, ARS 285.000, BRL 1.476,15, USD 421). No traducir las marcas "Nomai", "Nomito", "Ripio", "Celo" ni "Textile FX". -->

## 1. Resumen (`summary.value-proposition`)

**Nomai** conecta a viajeros de Latinoamérica con dueños de alojamientos mediante el agente de inteligencia artificial **Nomito**. El viajero busca gratis, paga en su moneda local a tarifa directa de dueño (sin el 15,5% a 18% de sobreprecio de las plataformas tradicionales) y protege el 100% de su dinero en un contrato de garantía (*Escrow*). El dueño recibe el 100% de su precio en su moneda local, con 0% de comisión y sin costos fijos mensuales.

---

## 2. Beneficios por destinatario

### 2.1 Para el Viajero (`[V]` *Traveler*)

| ID | Característica (qué hace) | Ventaja (qué permite) | Beneficio (qué gana) | Código VPC | Evidencia |
|---|---|---|---|---|---|
| `benefit.traveler.escrow-protection` | Custodia del 100% del alquiler en un contrato inteligente de garantía (*Escrow*) con reglas fijas de liberación (50% a 5 días del ingreso y 50% a 24 horas del ingreso). | Retiene el dinero fuera del alcance directo del alojamiento hasta que se cumplen los plazos de estadía, a diferencia de las transferencias o links de pago simples como kamiPay. | Obtiene reembolso automático del 100% si cancela hasta 5 días antes, o del 50% después, y cuenta con 24 horas desde el check-in para abrir un reclamo si el alojamiento no cumple. | `D1`, `A1`, `AL1`, `CR1` | **Implementado en código** (`contracts/Escrow.sol`, `keeper.ts`, `ADR-0006`); diferencial frente a kamiPay y CBU. |
| `benefit.traveler.direct-rate-local-currency` | Liquidación en monedas locales (`wARS`, `wBRL`, `wCOP`) mediante la rampa de Ripio sobre tarifas directas de dueño con comisión transparente (7% de *Service fee* + ~1% de *FX fee*). | Paga en su propia moneda local (por ejemplo, con PIX en reales) accediendo a precios sin la comisión del 15,5% al 18% de Airbnb o Booking.com. | Ahorra el sobreprecio de las agencias en línea y evita el ~8% de costo de tarjeta internacional brasileña (3,5% de IOF más spread bancario) o el 30% de percepción impositiva en pesos en Argentina. | `D2`, `A2`, `AL2`, `CR2` | **Datos de mercado 2026** (Airbnb 15,5%, Booking 15–18%, IOF Brasil 3,5%, percepción AR 30%); descuento directo del dueño `(supuesto)`. |
| `benefit.traveler.free-ai-search` | Agente conversacional **Nomito** gratuito que consulta disponibilidad real noche por noche. | Compara alojamientos en varios pueblos de una ruta turística dentro de una sola conversación. | Reduce horas de búsqueda en múltiples pestañas y conoce el precio final antes de pagar. | `D3`, `A3`, `AL3`, `CR3` | **Implementado en código** (`apps/agent`, `apps/web`); ahorro de tiempo `(supuesto)`. |
| `benefit.traveler.no-crypto-complexity` | Billetera interna automática (*Agent wallet*) con saldos expresados en moneda local y costos de red patrocinados vía x402. | Opera sobre infraestructura blockchain sin mostrar direcciones, tokens ni firmas técnicas. | Paga con la simplicidad de una transferencia local sin conocimientos técnicos de criptomonedas. | `D4`, `AL4` | **Implementado en código** (`wallet.ts`, `ADR-0003`, protocolo x402 en Linux Foundation). |
| `benefit.traveler.verified-reviews-and-chat` | Mensajería privada por reserva (*Thread*) y reseñas exclusivas de estadías completadas. | Coordina la llegada directamente con el dueño y consulta calificaciones ponderadas por antigüedad (36 meses). | Decide con opiniones reales que no pueden falsificarse y protege sus datos personales de contacto. | `D5`, `A4`, `A5`, `AL5`, `CR4`, `CR5` | **Implementado en código** (`ADR-0008`, `ADR-0009`). |

### 2.2 Para el Dueño del alojamiento (`[D]` *Owner*)

| ID | Característica (qué hace) | Ventaja (qué permite) | Beneficio (qué gana) | Código VPC | Evidencia |
|---|---|---|---|---|---|
| `benefit.owner.zero-commission` | Modelo de negocio sin comisiones por reserva ni suscripciones mensuales para el alojamiento (`0%` siempre). | Traslada el costo operativo de la plataforma a la tarifa de servicio que abona el viajero. | Cobra el 100% del precio publicado por noche y ahorra el 15,5% de comisión única de Airbnb o el 15% a 18% de Booking.com, sin costos fijos en meses de baja ocupación (44% en Salta). | `D6`, `D8`, `A6`, `AL6`, `AL8`, `CR6` | **Datos de mercado 2026** (Airbnb 15,5%, Booking 15–18%, ocupación Salta 44%) y regla fija en `service-fee.ts`. |
| `benefit.owner.cross-border-storefront` | Escaparate público propio (`/owners/[slug]`) con cobro internacional en moneda local y garantía *Escrow* integrada. | Comparte un enlace único por WhatsApp o Instagram cuando le consulta un turista extranjero (como el mercado brasileño, que creció +22% interanual con ticket promedio de USD 421). | Convierte consultas de viajeros de Brasil, Chile o la región que antes dudaban en transferir sin garantía en reservas pagadas al 100%, recibiendo pesos en su cuenta. | `D7`, `A7`, `AL7`, `CR7` | **Implementado en web** (`/owners/[slug]`); conversión de consultas `(supuesto)`. |
| `benefit.owner.upfront-payment-protection` | Confirmación de reserva condicionada al pago previo del 100% en el contrato de garantía (*Escrow*). | Libera el primer 50% al dueño 5 días antes del ingreso, incluso si el viajero cancela a último momento. | Elimina las reservas informales impagas (*no-shows*) y asegura el 50% del ingreso ante cancelaciones tardías. | `D9`, `A8`, `AL9`, `CR8` | **Implementado en código** (`book-payment.ts`, `keeper.ts`, `ADR-0006`). |
| `benefit.owner.verified-payout-onboarding` | Verificación empírica de la cuenta de cobro mediante un micro-depósito de prueba antes de liberar fondos. | Comprueba que la dirección de Ripio del dueño recibe correctamente el dinero antes de operar reservas reales. | Evita pérdidas por errores de carga de cuenta y retira el dinero a su banco local sin costo de rampa bajo el paraguas regulatorio PSAV de Ripio. | `D10`, `A10`, `AL10`, `CR10` | **Implementado en código** (`apps/api/src/payout.ts`). |
| `benefit.owner.guest-reputation` | Puntaje privado del viajero basado en estadías previas completadas en la plataforma. | Evalúa el historial del huésped en limpieza, comunicación y cumplimiento de normas de la casa. | Recibe huéspedes con antecedentes verificados por otros dueños de la red. | `A9`, `CR9` | **Implementado en código** (`traveler_score()`, `ADR-0008`). |

---

## 3. Beneficios por tipo

- **Económicos (`benefit.type.economic`):**
  - Para el **Dueño**: retención del 100% de la tarifa publicada (0% de comisión frente al 15,5% de Airbnb y 15%–18% de Booking.com) y $0 de costo fijo mensual.
  - Para el **Viajero**: acceso a tarifas directas de dueño (10% a 15% menores que en OTAs) pagando 7% de tarifa de servicio + ~1% de conversión en su moneda local.
- **Operativos (`benefit.type.operational`):**
  - Búsqueda y cotización multi-destino en una sola conversación con **Nomito**.
  - Mensajería privada 1 a 1 integrada en cada reserva con confirmación de lectura en tiempo real.
- **De riesgo y cumplimiento (`benefit.type.risk`):**
  - Custodia en contrato inteligente no-custodial (*Escrow*) donde Nomai solo puede rutear fondos al Viajero o al Dueño de esa reserva, mientras el KYC y el cumplimiento PSAV ante la CNV operan sobre la infraestructura regulada de Ripio.
- **Sociales y regionales (`benefit.type.social`):**
  - El ingreso turístico queda íntegro en los alojamientos independientes del Norte Argentino y Latinoamérica.
- **Estratégicos (`benefit.type.strategic`):**
  - Catálogo expuesto mediante el protocolo estándar **MCP** (Model Context Protocol) y liquidación sobre **x402** (Linux Foundation).

---

## 4. Antes / Después

| Situación | Antes (sin Nomai) | Después (con Nomai) |
|---|---|---|
| **Viajero argentino reserva en Jujuy o Salta (Fase 1 — mercado local)** | Si va por WhatsApp/Instagram transfiere el 50% por CBU a un desconocido sin garantía de devolución y con riesgo de estafa; si va por Airbnb paga en **dólares en tarjeta (+30% ARCA)** y en Booking paga **+21% de IVA** sobre tarifas infladas un 15%–18%. | Paga **100% en pesos (`ARS`)** a tarifa directa de dueño (con solo **7% de *Service fee*** y **0% de *FX fee***), y su dinero queda protegido en el contrato de **Escrow** con reembolso automático 100%/50%. |
| **Viajero brasileño o regional paga a una posada en Salta o Jujuy (Fase 2 — cross-border)** | No puede transferir a un CBU argentino, con tarjeta paga ~8% sobre precios inflados de OTA, o si paga por kamiPay (solo PIX) envía USD 421 sin garantía de reembolso si cancela. | Paga desde su moneda local (`BRL`, `CLP`, `COP`, `USDC`), su dinero queda resguardado en el contrato de **Escrow** y tiene reembolso automático del 100% hasta 5 días antes del ingreso. |
| **Dueño vende una estadía de ARS 285.000** | En Airbnb o Booking.com pierde entre ARS 42.750 y ARS 51.300 de comisión (15%–18%). | Cobra ARS 285.000 íntegros (0% de comisión) en dos tramos automáticos (50% a 5 días del ingreso y 50% a 24 h del check-in). |

---

## 5. Prueba y estado actual

- **Escenario verificable en el repositorio (`docs/design/traveler-views.md` §4):**
  Estadía de 3 noches en Cafayate cotizada en `ARS 285.000`. Conversión a `BRL` a tasa `1 BRL = 195 ARS`, con comisión de conversión explícita de `BRL 14,60` (~1%) y tarifa de servicio del `7%` (`service-fee.ts`).
- **Infraestructura y pruebas automatizadas en código:**
  - Tokens `wFIAT` de Ripio desplegados en Celo (jul/2026) y protocolo `x402` en la Linux Foundation.
  - Contrato de garantía (`pnpm --filter api smoke:escrow`), verificación de cobro (`smoke:payout`) y liquidador automático (`smoke:keeper`) funcionando.
- **Economía unitaria vs. escala:** Margen bruto del 85%–95% por reserva (~USD 2 de costo variable), requiriendo escalar del piloto de 15 cabañas (~22 reservas/mes) a 100–600 propiedades (120–400 reservas/mes) para alcanzar el punto de equilibrio.

---

## 6. Llamado a la acción (*Call to Action*)

- **Para el Viajero (`cta.traveler`):** *"Contale tu próximo viaje a Nomito en `/app`, accedé a precios directos de dueño y reservá en tu moneda con garantía Escrow."*
- **Para el Dueño (`cta.owner`):** *"Sumá tu alojamiento gratis en `/owners/join`, compartí tu link por WhatsApp con garantía y recibí el 100% de cada reserva sin comisiones."*

---

## 7. Glosario para traducción (`glossary.i18n`)

| Término en código / dominio | Español (`es`) | Portugués (`pt-BR`) | Inglés (`en`) | Regla de traducción |
|---|---|---|---|---|
| **Nomai** | Nomai | Nomai | Nomai | **No traducir** (marca de la plataforma). |
| **Nomito** | Nomito | Nomito | Nomito | **No traducir** (nombre propio del Agente; nunca traducir como "bot" o "asistente"). |
| **Traveler** | Viajero | Viajante | Traveler | Traducir siempre (evitar "usuario", "cliente" o "turista"). |
| **Owner** | Dueño / Hotelero | Proprietário / Hoteleiro | Owner | Traducir siempre (evitar "vendedor" o "comercio"). |
| **Lodging** | Alojamiento | Hospedagem / Acomodação | Lodging | Traducir siempre. |
| **Storefront** | Escaparate | Vitrine | Storefront | Traducir siempre. |
| **Booking** | Reserva | Reserva | Booking | Traducir siempre (evitar "orden" o "pedido"). |
| **Service fee** | Tarifa de servicio | Taxa de serviço | Service fee | Traducir siempre (evitar "comisión" o "créditos"). |
| **FX fee** | Comisión de conversión | Taxa de conversão | FX fee | Traducir siempre (evitar "spread" o "recargo oculto"). |
| **Escrow** | Garantía / Custodia (Escrow) | Garantia (Escrow) | Escrow | En textos para el cliente usar "garantía de reserva" o "custodia"; en textos técnicos conservar "Escrow". |
| **Claim** | Reclamo | Reclamação | Claim | Traducir siempre. |
| **Payout address** | Dirección de cobro | Endereço de recebimento | Payout address | Traducir siempre (no llamarla "billetera cripto"). |
