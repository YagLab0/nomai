# Cómo funciona nomai (en lenguaje natural)

## 1. En una frase

**Nomai** es una plataforma de reservas de alojamiento para Latinoamérica donde el viajero conversa gratis con un agente de inteligencia artificial (**Nomito**) para elegir dónde hospedarse, paga desde su moneda local accediendo al precio directo del dueño (sin el 15,5%–18% de comisión de las agencias tradicionales) y deja el 100% del alquiler protegido en una caja de garantía digital (*Escrow*) que libera el dinero al dueño en dos tramos con 0% de comisión.

---

## 2. Quiénes participan

1. **El Viajero (*Traveler*):** La persona que busca alojamiento:
   - **En Fase 1 (Validación y lanzamiento local en el NOA):** Un turista argentino de Jujuy, Salta, Tucumán, Córdoba o Buenos Aires que sube a la Quebrada o a los Valles (>80% de las reservas anuales) y quiere pagar en pesos (`ARS`) a precio directo sin arriesgarse a una estafa transfiriendo por CBU en redes sociales y sin pagar el dólar tarjeta de Airbnb (+30% ARCA).
   - **En Fase 2 (Expansión regional y tesis de Hackatón):** Un turista de Brasil (+22% interanual), Chile o el exterior que paga desde su propia moneda (`BRL`, `CLP`, `USDC`) con la misma garantía.
   Crea su cuenta con su teléfono o correo y es el único que paga una tarifa por el servicio (`7%`) al confirmar una reserva.
2. **El Dueño o Hotelero (*Owner*):** El propietario o encargado de una posada, complejo de cabañas o departamento turístico. En posadas familiares la misma persona administra todo; en hosterías medianas el encargado atiende los mensajes y las fotos, y el titular vincula la cuenta de cobro. Nunca paga comisión ni abono mensual.
3. **Nomito (el Agente de IA):** El asistente conversacional de Nomai (representado por un loro alisero de las Yungas del norte argentino). Busca alojamientos con lugar libre, calcula presupuestos noche por noche y ejecuta el pago o la cancelación cuando el viajero se lo indica.
4. **Ripio, Celo, x402 y la Garantía (*Escrow*) — los rieles invisibles:**
   - **Ripio** es una empresa regulada (PSAV ante la CNV en Argentina) que emite en la red **Celo** versiones digitales 1 a 1 de las monedas locales llamadas **wFIAT** (`wARS`, `wBRL`, `wCOP`, desplegadas en jul/2026) con carga y retiro bancario sin costo de rampa.
   - **x402** es el estándar abierto de pagos para agentes (respaldado por la Linux Foundation con miembros como Visa, Mastercard y Stripe) donde un facilitador verifica la firma y paga el costo de red ("gas").
   - El **Escrow** (contrato inteligente de garantía) es una bóveda digital no-custodial: recibe el alquiler y solo tiene permiso matemático para entregárselo al dueño de ese alojamiento en las fechas pactadas o devolvérselo al viajero si cancela o gana un reclamo.

---

## 3. El recorrido, paso a paso

### Paso 1 — El dueño publica su alojamiento a precio directo y verifica su cuenta con centavos
El dueño entra a `/owners/join`, sube las fotos de su cabaña, marca en el mapa en qué pueblo está (por ejemplo, Cafayate o Tilcara) y fija su precio por noche en su propia moneda (`$ 95.000 ARS`, sin tener que sumarle el 15,5% de Airbnb ni el 15%–18% de Booking). Para cobrar, pega la dirección de depósito de su cuenta de **Ripio**. Antes de habilitar los cobros, Nomai le envía automáticamente unos centavos de prueba: el dueño escribe cuántos centavos le llegaron y así queda comprobado sin margen de error que el dinero llega a su cuenta.

### Paso 2 — El viajero llega por el link del dueño o buscando con Nomito
El viajero puede entrar de dos maneras:
- **Por consulta directa al dueño:** El viajero le escribe por Instagram o WhatsApp a la posada; el dueño le responde con el enlace a su escaparate en Nomai (`/owners/hospedajes-andinos`) para que pueda pagar en su moneda con garantía de reembolso.
- **Conversando con Nomito (o desde otro asistente vía MCP):** El viajero entra a `/app` y le escribe en lenguaje común: *"Buscame cabañas tranquilas en Cafayate del 15 al 18 para 2 personas"*. **Nomito** revisa qué alojamientos tienen esas noches libres y muestra las opciones como tarjetas con forma de boleto de viaje.

### Paso 3 — El presupuesto claro antes de pagar
Cuando el viajero elige una cabaña, ve el detalle línea por línea en su propia moneda:
- Alquiler directo de las 3 noches (lo que recibe íntegro el dueño: `$ 285.000 ARS`).
- Tipo de cambio y **comisión de conversión** (~1%, solo si el viajero paga desde otra moneda, como reales brasileños).
- **Tarifa de servicio de Nomai** (**7%**, que cubre el costo de **Nomito** y del sistema de garantía).
- La regla única de cancelación: si cancela hasta 5 días antes de entrar, recupera el 100% del alquiler; si cancela dentro de los últimos 5 días, recupera el 50%.

### Paso 4 — Carga de saldo y pago instantáneo en garantía
El viajero nunca ve palabras técnicas de blockchain ni paga costos de red. Detrás de escena, Nomai le asigna una billetera interna (**Agent wallet**) que muestra su saldo en moneda local (`Tu saldo: R$ 1.500 BRL` o `$ 300.000 ARS`). El viajero carga ese saldo transfiriendo desde su banco o PIX a través de la rampa de Ripio y confirma la reserva. En ese instante:
1. El 100% del alquiler entra al contrato de **Escrow** (garantía) y las noches quedan reservadas.
2. El 7% de tarifa de servicio ingresa a Nomai.
3. Se abre automáticamente un **hilo de mensajes privado** dentro de la reserva para coordinar la llegada sin necesidad de pasarse teléfonos personales.

### Paso 5 — Liberación del dinero en dos etapas (el diferencial frente a kamiPay y transferencias)
A diferencia de un link de pago directo (como kamiPay o una transferencia CBU) donde el hotel recibe toda la plata en el acto y el viajero queda desprotegido, un proceso automático de Nomai (*keeper*) libera el dinero desde la garantía por etapas:
- **Cinco días antes del check-in:** Se vence el plazo de cancelación al 100% y la garantía le transfiere automáticamente el **primer 50%** del alquiler a la cuenta de Ripio del dueño.
- **Durante las primeras 24 horas desde el check-in:** Si al llegar la cabaña no existe, no le dan acceso o es completamente distinta a las fotos, el viajero puede abrir un **reclamo (*Claim*)** con fotos. El equipo de Nomai revisa las pruebas y ordena a la garantía cuánto devolver al viajero y cuánto liberar al dueño.
- **24 horas después del check-in sin reclamos:** La garantía le transfiere automáticamente el **segundo 50%** al dueño, que retira el total a su banco local sin comisión.

### Paso 6 — Reseñas cruzadas después de la estadía
Durante los **14 días siguientes al check-out**, el viajero puede calificar de 1 a 5 estrellas al alojamiento (opinión pública) y el dueño puede calificar al huésped (opinión privada visible solo para dueños que hospeden a ese viajero en el futuro). Como el sistema solo permite opinar sobre reservas efectivamente pagadas y completadas en cadena, nadie puede inventar reseñas falsas.

---

## 4. De dónde salen los datos y los puntajes

- **Alojamientos y disponibilidad:** Se guardan en la base de datos de Nomai (PostgreSQL en Supabase). Hoy el sistema incluye un catálogo inicial de demostración de **24 alojamientos en 6 países** y permite que cualquier dueño real cree y edite los suyos desde su panel.
- **Puntaje de alojamientos y dueños:** Usa una fórmula ponderada por antigüedad: una reseña escrita hoy vale el 100% de su peso y se va desvaneciendo gradualmente hasta valer cero a los **36 meses**.
- **Control del uso gratuito de Nomito:** Aplica verificación escalonada (teléfono al registrarse, primera carga de saldo después y documento de identidad al reservar) y un presupuesto diario máximo de consultas gratuitas (`ADR-0002`).

---

## 5. Qué no hace el producto

- **No cobra comisión ni abono mensual a los dueños de alojamientos.**
- **No acepta reservas "a pagar en efectivo al llegar" ni reservas pendientes de pago:** en Nomai, pagar es confirmar.
- **No permite que Nomai se quede con el dinero en garantía:** el contrato `Escrow.sol` solo permite enviar la plata al viajero o al dueño de esa reserva.
- **Hoy no permite al dueño bloquear noches sueltas sin una reserva:** toda noche sin reserva confirmada en Nomai figura como libre.

---

## 6. Qué es real y qué es demostración hoy (verificado contra el código)

| Parte del producto | Estado actual | Detalle real en el repositorio |
|---|---|---|
| **Catálogo público (`/lodgings`), escaparates (`/owners/[slug]`) y alta de dueños (`/owners/join`)** | **Funciona** | Conectado a Supabase y subida real de fotos a Supabase Storage (`apps/api/src/owners.ts`). Los 24 alojamientos iniciales son datos de prueba (`seed.sql`). |
| **Cobro por protocolo x402 y depósito en el contrato de garantía (`Escrow.sol`)** | **Funciona** | `apps/api/src/book-payment.ts` cotiza en vivo, exige pago x402 con el 7% de tarifa de servicio (`service-fee.ts`) y liquida en el contrato `contracts/Escrow.sol`. Probado en red de pruebas y ganache (`smoke:escrow`, `smoke:book`). |
| **Verificación de cuenta de cobro del dueño con micro-depósito (`payout.ts`)** | **Funciona** | Envía el depósito de prueba en cadena, aplica tiempos de espera y valida el monto exacto (`smoke:payout`). |
| **Liberación automática 50% / 50% y reembolsos por cancelación (`keeper.ts`)** | **Funciona** | Calcula los vencimientos (-5 días y +24 horas), retiene fondos si el dueño aún no verificó su cuenta y ejecuta las transferencias en la red Celo (`smoke:keeper`). |
| **Reseñas de dos lados (`ADR-0008`) y mensajería en tiempo real por reserva (`ADR-0009`)** | **Funciona** | Reglas blindadas en base de datos, cálculo de puntaje ponderado a 36 meses y actualización instantánea de mensajes con tilde de *visto*. |
| **Agente Nomito (`apps/agent` y `/app`)** | **Mixto (real + demo)** | El agente real en `apps/agent` (sobre Eve con DeepSeek) tiene todas las herramientas reales (`search_listings`, `quote_booking`, `book_listing`, `cancel_booking`, `open_claim`), mientras que `/app` incluye además un adaptador guionado (`mock-adapter.ts`) para demostraciones sin gastar saldo. |
| **Conversión automática entre monedas distintas al reservar (ej. `wBRL → wARS` en Textile FX)** | **En desarrollo (simulado en UI)** | Documentado en `docs/corredor-wfiat-pagos.html`, pero hoy `book-payment.ts` (líneas 113–117) exige que la billetera del viajero ya tenga la misma moneda en que está publicado el alojamiento (`wARS` para Argentina). |
| **Rampa de carga de saldo de Ripio** | **De prueba / enlace externo** | En la interfaz abre el enlace hacia Ripio; la integración comercial B2B con el widget embebido de Ripio Ramps está pendiente de acuerdo pos-hackathon. |

---

## 7. Lo que viene (próximos pasos del producto)

1. **Validar en campo en Jujuy y Salta (`H1`) y habilitar el bloqueo manual de fechas / iCal:** sumar las primeras 15 cabañas reales asegurando que puedan bloquear noches vendidas por WhatsApp/Booking.
2. **Conectar la conversión automática (`swap` en Textile FX) dentro del pago de la reserva:** para que un viajero con reales (`wBRL`) pague en un clic una cabaña publicada en pesos argentinos (`wARS`).
3. **Integrar la rampa B2B de Ripio dentro de la pantalla de pago:** para que el viajero pague con PIX o transferencia local sin salir a otra pestaña.
4. **Escalar de 15 a 100–600 propiedades:** pasar del piloto de validación en Jujuy/Salta (~22 reservas/mes) al volumen de punto de equilibrio (120–400 reservas/mes).
