# Diagnóstico del negocio — nomai

## 1. Veredicto en una frase

🟡 **Planteado a medias (rentable en la unidad tanto en pesos como cross-border, incierto en la escala y listo para validar en Jujuy/Salta sin depender de viajeros extranjeros):** La economía por reserva es excelente (**7% de ingreso en reservas domésticas en `wARS` y ~8% en reservas cross-border con `FX fee`, costos variables de ~USD 0,50–2,00 y margen bruto del 85%–95%**) y el flujo en pesos (`wARS → Escrow.sol → wARS`) **ya funciona hoy al 100% en el código**. Esto permite **validar en Fase 1 con dueños y viajeros argentinos/regionales del NOA** (atacando el miedo a las estafas por CBU/WhatsApp y el dólar tarjeta de Airbnb) antes de escalar a la **Fase 2 cross-border (Brasil/LatAm)** y a las **100–600 propiedades (120–400 reservas/mes)** que exige el punto de equilibrio.

---

## 2. Semáforo por pregunta

| # | Pregunta | Estado | Por qué (en una línea) | Fuente en el documento |
|---|---|---|---|---|
| 1 | **¿El problema existe y duele?** | 🟢 | Del lado dueño duele más que nunca (Airbnb **15,5%**, Booking **15%–18%**, ocupación Salta **44%**, `D6`); del lado viajero argentino y extranjero, pagar por CBU/WhatsApp o kamiPay no tiene garantía ante estafas ni reembolso al cancelar (`D1`), mientras Airbnb factura en USD (+30% ARCA) y Booking suma +21% IVA (`D2`). | `propuesta-de-valor.md` (`D1`, `D2`, `D6`) y `entrevista.md` (§3) |
| 2 | **¿Se sabe quién es el cliente?** | 🟢 | Separado en dos fases realistas: **Fase 1 (Validación local en calle)** con cabañas de Jujuy/Salta y viajeros argentinos/regionales (>80% de la demanda del NOA, accesibles hoy mismo); **Fase 2 (Expansión y Hackatón)** sumando turistas brasileños (+22% YoY) y de LATAM (`CLP`, `COP`, `USDC`). | `business-model-canvas.md` (Bloque 1) y `entrevista.md` (P4) |
| 3 | **¿Alguien paga?** | 🟡 | Paga el `[V]` Viajero (**7% Service fee** en reservas domésticas en `ARS`, o **8% total** con `~1% FX fee` en reservas cross-border); es rentable en ambos casos (~90% de margen bruto) si el dueño publica una tarifa directa 10%–12% menor que en las OTAs. | `business-model-canvas.md` (Bloque 5) y `entrevista.md` (§3.1) |
| 4 | **¿Es mejor que lo que usa hoy?** | 🟢 | **En Argentina (Fase 1):** 10%–18% más barato que Airbnb (USD + 30% ARCA) y Booking (+21% IVA), y con garantía **Escrow** frente a estafas por CBU. **En Brasil/LatAm (Fase 2):** supera a kamiPay por el **Escrow** y por cubrir monedas donde PIX no existe (`CLP`, `COP`, `MXN`, `USDC`). | `business-model-canvas.md` (§2 Competencia) |
| 5 | **¿Es difícil de copiar?** | 🔴 | Las 5 fuerzas son altas: el código usa estándares abiertos y **kamiPay** ya tiene +25M de transacciones en PIX hotelero; la defensa real es construir rápido la red de dueños con reseñas verificadas en cadena (`ADR-0008`). | `business-model-canvas.md` (§3 Las 5 fuerzas de Porter) |
| 6 | **¿Se puede llegar al cliente?** | 🟢 | Al validar Fase 1 con dueños y viajeros argentinos/del mismo Jujuy y Salta, el equipo no necesita reclutar turistas en Brasil para probar el embudo: juega 100% de local y el link `/owners/[slug]` por WhatsApp tiene CAC $0. | `business-model-canvas.md` (Bloque 3) y `entrevista.md` (P2, P4, P5) |
| 7 | **¿Los números cierran?** | 🟡 | **Cierran en la unidad (~90% de margen en `wARS` al 7% y en cross-border al 8%), pero no en la escala del piloto:** 15 cabañas generan ~22 reservas/mes (~USD 450–650/mes), mientras que el punto de equilibrio exige **120–400 reservas/mes (100–600 propiedades)**. | `business-model-canvas.md` (Bloques 5 y 9) y `entrevista.md` (§3.4) |
| 8 | **¿El equipo puede hacerlo?** | 🟢 | El equipo ya construyó la parte técnica dura, Ripio desplegó `wFIAT` en Celo (jul/2026) y el régimen PSAV de la CNV queda cubierto del lado de Ripio manteniendo a `Escrow.sol` no-custodial. | `business-model-canvas.md` (Bloques 6 y 8) y `entrevista.md` (§3.5) |
| 9 | **¿El producto hace lo que dice el canvas?** | 🟢 / 🟡 | **Para Fase 1 (`ARS → wARS`) ya funciona hoy al 100%** (`Escrow.sol`, `keeper.ts`, `payout.ts`, `book-payment.ts` en `wARS`) y solo requiere agregar el botón de bloqueo de fechas ocupadas; **para Fase 2 (`wBRL → wARS`)** falta conectar el swap automático de Textile FX. | `historias-de-usuario.md` (`HU1`, `HU2`) y `como-funciona.md` (§6) |

---

## 3. Las 3 alertas principales (y qué hacer esta semana)

### Alerta 1 — Validar en Jujuy/Salta con viajeros argentinos primero (`Fase 1`) y habilitar el bloqueo de fechas antes de activar la primera cabaña
- **Qué pasa:** Intentar conseguir turistas en Brasil para las primeras entrevistas frenaría la salida a calle, cuando en realidad **más del 80% de las reservas en Quebrada y Valles son de argentinos/regionales** y el flujo en pesos (`wARS → Escrow.sol → wARS`) **ya está 100% operativo en el código actual**. El único freno técnico para la Fase 1 es que el dueño hoy no puede bloquear noches sueltas vendidas por fuera (`GLOSSARY.md`: *"Owners can't block nights"*).
- **Por qué importa:** Probar con viajeros de Jujuy, Salta, Tucumán o CABA permite medir `H1`, `H2` y `H3` esta misma semana con costo cero y margen bruto del ~90% (7% *Service fee*).
- **Qué hacer esta semana:**
  1. Salir a entrevistar en persona a **15 dueños de cabañas/posadas en Jujuy y Salta** y hacer el test de pasillo `H3` con **5 viajeros locales de Jujuy/Salta**.
  2. Agregar en `/app/lodgings` el botón para que el dueño **bloquee noches ocupadas por otros canales** antes de activar la primera cabaña real.

### Alerta 2 — En 2026 el diferencial es la Garantía Escrow + el Precio Directo en pesos (no el tipo de cambio aislado)
- **Qué pasa:** Para el viajero argentino (Fase 1), el dolor es elegir entre **ser estafado en una transferencia CBU por Instagram/WhatsApp** o **pagar Airbnb en dólares (+30% ARCA) / Booking (+21% IVA + 15%–18% de sobreprecio)**. Para el viajero brasileño (Fase 2), con el IOF en **3,5%** (+ spread = **~8%**), la tarjeta cuesta lo mismo que el 8% de Nomai, y para pagar con PIX sin custodia ya existe **kamiPay**. En ambos mercados, lo que destraba la venta es **(1) la tarifa directa del dueño (10%–12% menor que en OTAs)** y **(2) el contrato `Escrow.sol` (reembolso automático 100%/50% y reclamos 24 h)**.
- **Por qué importa:** Si el dueño publica en Nomai el mismo precio inflado de Booking.com, el viajero no percibe ahorro frente a la OTA.
- **Qué hacer esta semana:**
  1. Al dar de alta a los primeros dueños en `/owners/join`, acordar que su tarifa en Nomai sea **al menos un 10% menor que su tarifa inflada de Booking/Airbnb** (el dueño igual gana un 5,5%–8% más limpio y el viajero ahorra de verdad).
  2. Destacar en `/owners/[slug]` y `/app` el sello **"Garantía Escrow: tu seña protegida con devolución automática 100% hasta 5 días antes + pago en pesos sin dólar tarjeta"**.

### Alerta 3 — Conectar el swap `wBRL → wARS` en `book-payment.ts` para la Fase 2 (Hackatón y turismo regional)
- **Qué pasa:** Hoy `apps/api/src/book-payment.ts` (líneas 113–117) exige pagar en el mismo token del alojamiento (`wARS`), por lo que la Fase 1 doméstica ya anda hoy, pero la Fase 2 (turistas brasileños con `wBRL` o chilenos con `wCLP`) requiere conectar el swap automático de **Textile FX**.
- **Por qué importa:** Es la pieza que completa la tesis cross-border para el jurado de la hackatón (Celo + Ripio) y abre los corredores internacionales donde kamiPay no llega (`CLP`, `COP`, `MXN`, `USDC`).
- **Qué hacer esta semana:**
  Mientras corre el piloto local en `wARS` (Fase 1), conectar la cotización y firma RFQ de **Textile FX** (`wBRL → wARS`) dentro de `book_listing` / `book-payment.ts`.

---

## 4. Lo que está bien (puntos fuertes reales para construir encima)

1. **Economía unitaria sobresaliente (85%–95% de margen bruto) sobre infraestructura ya madura:** Cada reserva de USD 250–421 genera USD 20–33 de ingreso con menos de USD 2 de costo variable gracias a que el gas en Celo es sub-centavo, el facilitador x402 (hoy en la Linux Foundation) patrocina el settle y Ripio ya tiene `wFIAT` en producción en Celo con rampa 0%.
2. **Encuadre regulatorio limpio (PSAV + Escrow no-custodial):** Al apoyarse en Ripio para la conversión fiat ↔ `wFIAT` y el KYC bancario, y al haber diseñado `contracts/Escrow.sol` de modo que el árbitro de Nomai **jamás puede enviarse fondos a sí mismo** (solo al Viajero o al Dueño de esa reserva), el proyecto reduce drásticamente su exposición regulatoria frente a la CNV.
3. **El argumento "0% al dueño + garantía Escrow" ataca el punto ciego exacto entre Booking/Airbnb y kamiPay:** Booking y Airbnb tienen garantía pero le sacan el 15,5%–18% al dueño; kamiPay y el CBU no le cobran comisión al hotel pero dejan al viajero sin garantía de reembolso ni traen clientes nuevos. Nomai se para exactamente en el medio de los dos.

---

## 5. Supuestos sin respaldo (ordenados de mayor a menor riesgo)

1. **`(supuesto 1 — crítico)`** Qué porcentaje real de las consultas de WhatsApp que reciben el link `/owners/[slug]` del dueño termina pagando el 100% por adelantado en Nomai (`H1`, `H2`).
2. **`(supuesto 2 — crítico)`** Que los dueños acepten publicar en su escaparate de Nomai una tarifa directa 10%–12% menor que la que publican en Booking/Airbnb (`H1`).
3. **`(supuesto 3 — alto)`** Que el viajero brasileño complete el fondeo en la rampa de Ripio sin abandonar el checkout por fricción de KYC (`H3`).
4. **`(supuesto 4 — alto)`** Que el equipo pueda escalar de las 15 cabañas presenciales en Jujuy/Salta (~22 reservas/mes) a **100–600 propiedades (120–400 reservas/mes)** mediante captación remota sin disparar el costo de adquisición (`H5`).
5. **`(supuesto 5 — medio)`** Que los viajeros que descubren una posada gratis usando a *Nomito* no la busquen en Instagram para pagarle por fuera y ahorrarse el 7% (`H5`).

---

## 6. Cinco ajustes concretos al plan y caminos si hubiera que replantear

1. **Ajuste 1 (Inmediato):** Ejecutar esta temporada las **15 entrevistas presenciales `H1`** en Jujuy y Salta antes de agregar cualquier función nueva que no sea el bloqueo de fechas y el swap `wBRL → wARS`.
2. **Ajuste 2 (Propuesta de valor y copy):** Reemplazar en la landing y en el pitch la promesa vieja de *"ahorrá 30% de dólar tarjeta"* por la promesa vigente en 2026: **"Precio directo de dueño (sin el 15,5%–18% de Airbnb/Booking) + 100% protegido en Garantía Escrow con reembolso automático"**.
3. **Ajuste 3 (Política de precios por canal — resuelve la duda del equipo sobre la rentabilidad del Escrow suelto):**
   - Si en el piloto ven que el **7% de *Service fee*** frena el pago cuando el cliente **lo trajo el propio dueño por su WhatsApp** (compitiendo contra kamiPay), separar la tarifa en dos:
     - **Modo Link Directo del Dueño (`/owners/[slug]`):** cobrar **2,5%–3,5% de *Service fee* + 1% *FX fee*** (solo por la garantía *Escrow* y el riel transfronterizo).
     - **Modo Demanda Incremental (`Nomito` / `/lodgings` / `MCP`):** cobrar el **7% de *Service fee* + 1% *FX fee*** cuando Nomai le trae un huésped nuevo al dueño.
4. **Ajuste 4 (Ruta de escala de 15 a 300+ propiedades):** Una vez validado el piloto en Quebrada y Cafayate (~22 reservas/mes), no quedarse encerrados solo en Jujuy/Salta: abrir en el mes 3 los tres destinos argentinos con mayor volumen de turismo brasileño y ticket alto (**Bariloche, Iguazú y Mendoza**, donde el ticket promedio hotelero ronda los **USD 421**).
5. **Ajuste 5 (Alianza con motores de reserva / PMS o con Ripio):** Para pasar de 50 a 600 alojamientos sin ir puerta por puerta, integrar el checkout con *Escrow* de Nomai y el servidor **MCP** como plugin para motores de reserva regionales o como vertical turístico co-brandeado con **Ripio**.
