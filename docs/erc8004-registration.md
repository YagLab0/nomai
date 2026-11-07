# Registro ERC-8004 de la identidad del agente Nomai

> Plan para el punto 4 del kit de la última semana de **Agents on Open
> Rails**: llamar a `register(agentURI)` en el Identity Registry de Celo
> mainnet desde la wallet del agente y leer el `agentId` del evento
> `Registered`. Es el único ítem pendiente del kit (los attribution tags y el
> x402 ya están wireados) y es un requisito visible para los organizadores:
> el checklist de Celo del entry lo chequea y los hosts ven qué entries no
> tienen identidad. Deadline del hackathon: **9/11/2026, 9:00 (Africa/Abidjan)**.

Guía oficial: <https://docs.celo.org/build-on-celo/build-with-ai/8004>.

## Estado (2026-11-07)

**Registrado.** La wallet del proyecto es la identidad ERC-8004 de nomai en
Celo mainnet:

| | |
|---|---|
| `agentId` | **10049** |
| owner / `agentWallet` | `0x8BCF810436f39cb386d0137B738a516F44d8731C` (wallet del proyecto) |
| `agentURI` | <https://nomaiapp.vercel.app/.well-known/agent.json> |
| tx | <https://celoscan.io/tx/0x2ed0d353dc365a64c024f24ec88dd82b639c0332dce6dcb1918abc36faf13e50> |
| attribution tag | `celo_40fb48026a9f` (verificado en la tx minada) |
| costo | 0.03612 CELO |

Implementación (en vez de `apps/api`, se sirve desde el **web origin** — es el
único dominio público estable y es donde ya viven los well-knowns de MCP):

- `apps/agent/agent/lib/erc8004.ts` — registry por red, `register` / `readIdentity`
  / `setAgentURI`, y los guards del mint: sin `CELO_ATTRIBUTION_TAG` no firma,
  no acuña una segunda identidad si la wallet ya tiene una, y verifica el tag en
  la tx minada (`Registered` es la fuente del `agentId`, nunca el `_lastId` de la
  simulación).
- `apps/agent/scripts/register-8004.ts` — `pnpm --filter agent erc8004`:
  `--check`, `--dry-run` (simula + gas), `--confirm-<network>` para enviar,
  `--set-uri` para repuntar.
- `apps/web/src/lib/agent-identity.ts` + `/.well-known/agent.json` — el documento
  de registro que resuelve el `agentURI`; `AGENT_ID = 10049`.
- `ERC8004_AGENT_ID=10049` en `apps/agent/.env`.

**Pendiente:** el entry en Loops todavía no existe (`loops project get` →
`exists: false`), así que falta crearlo con `agent-wallet` =
`0x8BCF810436f39cb386d0137B738a516F44d8731C` (ver §5, paso 4).

## 1. Qué es ERC-8004 y por qué lo hacemos

ERC-8004 da identidad verificable y portable a agentes: un ERC-721 cuyo dueño
controla el registro, con un `agentURI` que apunta a un archivo JSON de
registración que lista los endpoints, capacidades y soporte de x402. Otros
agentes — y los organizadores del hackathon — lo descubren y verifican ahí.

Celo tiene los registros desplegados en mainnet:

| Contrato | Celo mainnet (42220) | Celo Sepolia (11142220) |
| --- | --- | --- |
| Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

Además pesa en el criterio de evaluación *"Real use of wFIAT and the Celo
stack"* (20 % del track LatAm), que nombra explícitamente la identidad
ERC-8004 como uso del stack.

**Advertencia clave de la guía:** `register()` acuña el NFT a `msg.sender`
y fija `agentWallet = msg.sender`: esa dirección queda publicada como la
wallet de pago del agente y controla `setAgentURI`, transferencias y toda
llamada owner-only. La payee se cambia después fácilmente (`setAgentWallet()`
con firma de la nueva wallet), pero el **dueño es lo incómodo de deshacer**.
Por eso el registro se hace desde la key que debe ser la dueña.

## 2. Estado actual del repo

- **ADR-0003 (enmienda):** *"No per-Traveler ERC-8004 identity"* — la
  identidad verificable es la del proyecto Nomai, registrada desde la wallet
  operativa del proyecto; no una por Traveler (costaría gas de la plataforma
  por wallets que quizá nunca se fondean). La columna
  `agent_wallets.erc8004_agent_id` queda sin uso en este plan (ver 3.3).
- `apps/agent/agent/lib/celo.ts` ya tiene la base lista:
  - `walletClient()` con el **attribution tag en `dataSuffix`** para todas
    las txs — su comentario dice explícitamente "ERC-8004 register".
  - `agentAccount()` (env `CELO_PRIVATE_KEY`), `publicClient()`, RPC
    `forno.celo.org`, chains `celo`/`celoSepolia` con viem.
- `apps/api` ya sirve las dos superficies que la registración va a anunciar:
  el **MCP server** (`POST /mcp`, ver `docs/mcp.md`) y el **seller x402**;
  `apps/agent` (Nomito, sobre eve) es el agente que las consume.
- `apps/api/scripts/escrow-lib.ts` ya modela el patrón de envío verificado:
  `withAttribution`, `verifyTx` y "refuse to send untagged".
- En Loops, el entry **aún no está completo**: falta el campo requerido
  `agent-wallet` de la submission.

## 3. Decisiones de diseño

### 3.1 ¿Desde qué wallet se registra?

La del **proyecto**, no una de Traveler: lo decide la enmienda de ADR-0003.
Dentro de eso:

1. La wallet de `CELO_PRIVATE_KEY` de `apps/agent` — la que Nomito usa para
   enviar sus propias txs. **Recomendada**: la dirección registrante queda
   publicada como wallet del agente, y es justamente lo que el checklist
   quiere ver ("registrá desde la wallet de tu agente"), siempre que esa
   misma dirección sea la que se declara como `agent-wallet` en Loops.
2. La wallet admin del vault (`ESCROW_ADMIN_PRIVATE_KEY` / ops de
   `apps/api`) — coherente con la "wallet operativa del proyecto" del ADR,
   pero mezcla el rol administrativo del escrow con la identidad pública del
   agente.

> **Regla de oro:** la dirección que firma `register()` debe ser la **misma**
> que se setea en el campo `agent-wallet` de la submission. Si son distintas,
> el checklist no reconoce la identidad como del entry.
>
> Nota de inventario: hoy `apps/agent/.env` no tiene `CELO_PRIVATE_KEY`
> seteada (sólo trae las keys de OpenCode Go y `NOMAI_API_URL`), así que la
> wallet del agente todavía no existe como custodia del proyecto — ver 4.1.
> La wallet admin de `apps/api` sí está en uso (escrow/keeper, con su tag
> `CELO_ATTRIBUTION_TAG`).

### 3.2 ¿Dónde se aloja el archivo de registración (`agent.json`)?

El URI debe ser **HTTPS público y estable**; el spec no exige una ruta
concreta. Implementado: `GET /.well-known/agent.json` en **apps/web**, servido
por el handler de well-knowns (`src/app/api/well-known/[...path]/route.ts`,
rewrite desde `/.well-known/*`) y construido en
`apps/web/src/lib/agent-identity.ts`.

Es una desviación deliberada de la recomendación original (`apps/api`): el web
origin (`nomaiapp.vercel.app`) es el único dominio público estable que el repo
controla, ya sirve los well-knowns de OAuth/MCP y se despliega con push — el
host de la API no es un dominio conocido. Los `endpoints` del documento se
derivan del origin del request, así que previews y un dominio propio se
anuncian solos.

La alternativa descartada era un archivo estático en `apps/web/public/`: es más
simple, pero el `agentId` quedaría congelado en el archivo y cada cambio
obligaría a otro deploy igual.

Contenido inicial (sin `registrations`, que sólo se agrega después de minar):

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Nomai Traveler Agent (Nomito)",
  "description": "Agente de viajes: busca lodgings, cotiza en moneda local y paga Bookings en wFIAT sobre x402, con los fondos en escrow del Booking.",
  "image": "<URL del logo de Nomito en apps/web/public>",
  "services": [
    { "name": "web", "endpoint": "https://<dominio web>" },
    { "name": "MCP", "endpoint": "https://<dominio api>/mcp", "version": "2025-06-18" }
  ],
  "x402Support": true,
  "active": true,
  "supportedTrust": ["reputation"]
}
```

Después de minar, el endpoint agrega:

```json
"registrations": [
  {
    "agentId": <agentId leído del evento>,
    "agentRegistry": "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
  }
]
```

Como el URI **no cambia** (es la misma URL HTTPS), no hace falta
`setAgentURI` después: basta actualizar el archivo servido.

### 3.3 ¿Dónde se persiste el `agentId`?

Lo mínimo y suficiente: `apps/agent/.env` (`ERC8004_AGENT_ID=`) + el valor
dentro del `agent.json` servido. La DB no necesita nada: la identidad es
única del proyecto, no por Traveler. La columna
`agent_wallets.erc8004_agent_id` se queda donde está (nullable) — si más
adelante se quieren identidades por Traveler (p. ej. Self Agent ID con
proof-of-human), ahí vuelve a aplicar.

### 3.4 ¿Gas en CELO o fee abstraction?

En mainnet el gas se paga en CELO, o fee abstraction con el adapter de USDC
(la guía muestra `feeCurrency` por llamada). Recomendación: **CELO directo**
en la primera registración (fondear la wallet con ~0,1 CELO cubre
holgadamente) y dejar `feeCurrency` como mejora posterior, no como primer
envío.

## 4. Necesitamos (pre-requisitos)

1. ~~Crear/custodiar la wallet distintiva del agente~~ — hecho: `CELO_PRIVATE_KEY`
   en `apps/agent/.env` deriva a la wallet del proyecto
   (`0x8BCF810436f39cb386d0137B738a516F44d8731C`), que es también la que va al
   campo `agent-wallet` de la submission y la dueña de la identidad.
2. ~~Fondear esa wallet en mainnet~~ — hecho: la wallet de ops paga el gas.
3. ~~`CELO_ATTRIBUTION_TAG` en `apps/agent/.env`~~ — hecho: `celo_40fb48026a9f`,
   confirmado contra `loops project get --event agents-on-open-rails`
   (campo `celo.attributionTag`). Una tx **no se puede taggear
   retroactivamente**: sin tag no cuenta para el hackathon.
4. ~~Deployment HTTPS con dominio estable~~ — hecho: el web origin sirve
   `/.well-known/agent.json` (ver §3.2).
5. **El JSON de registración listo** con el `agentRegistry` en formato
   CAIP-10/CAIP-11: `eip155:<chainId>:<registryAddress>` — hecho para
   `eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.

## 5. Plan de implementación

> Ejecutado el 2026-11-07 (ver §Estado). Los pasos quedan como referencia de
> lo construido; las desviaciones están marcadas.

### Paso 0 — Configuración y fondeo (30 min, arrancar primero)

1. Setear `CELO_PRIVATE_KEY`, `CELO_ATTRIBUTION_TAG` (de Loops) y
   opcionalmente `ERC8004_AGENT_ID` en `apps/agent/.env`.
2. Fondear la wallet con CELO en mainnet.
3. Leer el tag en Loops y anotar la dirección `agent-wallet` (la de la key
   nueva).

### Paso 1 — Módulo `apps/agent/agent/lib/erc8004.ts` (45 min)

ABI mínimo del Identity Registry (el del ejemplo oficial sirve):

```ts
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const abi = [
  {
    type: "function", name: "register", stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "event", name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string" },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;
```

(después se agregan `setAgentURI`, `ownerOf` y `tokenURI` para el modo
idempotente; los clients `publicClient()` y `walletClient()` ya existen en
`celo.ts`).

Función `registerAgent(agentURI: string)`:

1. `publicClient.simulateContract({ account, address: IDENTITY_REGISTRY, abi, functionName: "register", args: [agentURI] })` →
   `{ request }`. El `agentId` que devuelve la simulación **NO se usa**: es
   `_lastId` al momento de simular y otro registro previo lo invalida; la
   verdad está en el evento minado.
2. `walletClient().writeContract({ ...request })` — con el tag en
   `dataSuffix` ya heredado del wallet client.
3. `waitForTransactionReceipt` + `parseEventLogs({ abi, eventName:
   "Registered", logs: receipt.logs })` → `args.agentId`, `args.owner`.
4. Verificar `verifyTx({ client, hash })`: debe traer el tag del entry en
   `codes` (patrón de `escrow-lib.ts`). Si no lo trae, abortar y corregir el
   env antes de cualquier otro envío.

**Idempotencia:** si `ERC8004_AGENT_ID` ya existe en el env, no re-registrar
(cada `register()` acuña otro NFT — duplicaría la identidad): leer
`ownerOf(agentId)` y `tokenURI(agentId)`; si `owner === agentAccount()
.address` y el URI coincide, no-op; si difiere, `setAgentURI`.

### Paso 2 — Script CLI (30 min)

`apps/agent/scripts/register-8004.ts` (`pnpm --filter agent erc8004`),
siguiendo el estilo de `apps/api/scripts/escrow-deploy.ts` (tag requerido
antes de enviar nada; imprime hash, explorador, tag y `agentId`; modo
`--json`):

- Toma el URI de `--uri` o `ERC8004_AGENT_URI`, o lo compone de
  `PUBLIC_WEB_URL` (default `https://nomaiapp.vercel.app`) ×
  `/.well-known/agent.json`.
- `--check` (solo lectura), `--dry-run` (simula + estima gas, no envía),
  `--confirm-<network>` para transmitir, `--set-uri` para repuntar.
- Llama a `registerAgent()` con seguridad de simulación, y al final imprime
  la línea para pegar en `apps/agent/.env`.
- Si la tx se revierte, reporta el motivo (`ExecutionReverted`) sin
  reintentar.

### Paso 3 — Endpoint `GET /.well-known/agent.json` (30 min)

> **Desviación:** se sirve desde **apps/web**, no desde `apps/api` (ver §3.2).

- Handler en `apps/web/src/app/api/well-known/[...path]/route.ts` (rewrite
  desde `/.well-known/*`), documento armado en
  `apps/web/src/lib/agent-identity.ts`.
- `AGENT_ID` es una constante commiteada (hoy `10049`); `ERC8004_AGENT_ID`
  la overridea en runtime si se setea en el deployment.
- Los endpoints se derivan del origin del request, así que previews y un
  dominio propio se anuncian solos.

### Paso 4 — Registro real y cierre del entry (30 min)

1. ~~Correr el script en mainnet y guardar el `agentId`~~ — hecho: `10049`.
2. Confirmar que el endpoint servido ahora lista el `registrations` con el
   agentId correcto.
3. Crear el entry en Loops (hoy **no existe**: `loops project get` →
   `exists: false`) y cargar el `agent-wallet`:

```sh
loops project create --event agents-on-open-rails --name <nombre>
loops project update --event agents-on-open-rails \
  --answer agent-wallet=0x8BCF810436f39cb386d0137B738a516F44d8731C --confirm
```
4. Verificar con `loops project get` que aparece
   `project.celo.agentWallet`.

## 6. Verificación

1. `verifyTx({ client, hash })` sobre la tx del registro: el tag del entry
   debe estar en `codes`.
2. Volver a parsear el evento `Registered` y comparar el `agentId` con el
   persistido (y `owner` con la dirección del agente).
3. Abrir <https://8004scan.io/> y buscar la wallet del agente: la identidad
   debe figurar en el registry de Celo mainnet.
4. Abrir `https://<dominio api>/.well-known/agent.json`: el `agentId` y los
   endpoints deben coincidir con lo on-chain.
5. En el checklist de Celo de la página de submit de Loops, pulsar **Find
   it** para que escanee la primera tx taggeda del entry (si no la encuentra
   — wallet smart account con bundler — pegar el hash a mano).
6. Armar la submission con `project create`/`update` (sin `--confirm`
   primero, mostrar el draft) y correr `loops evaluate` contra los sponsors
   objetivo para ver qué queda flojo.

## 7. Casos de borde

| Caso | Qué hacer |
| --- | --- |
| La wallet ya tiene identidad y no hay `agentId` guardado | No volver a registrar (duplicaría el NFT): recuperar el `agentId` de los logs del registry (evento `Registered` con `owner = <agentAddress>`) o de 8004scan, corroborar con `ownerOf`, y seguir en el paso 3 del plan. |
| Otro registro en el mismo bloque invalida el `_lastId` de la simulación | Irrelevante: el `agentId` se saca del evento minado, nunca del return de la simulación. |
| La wallet se queda sin gas | La tx se revierte y nada se pierde; refondear y reintentar. Con el tag seteado una vez, el reintento queda igual de taggeado. |
| Falta `CELO_ATTRIBUTION_TAG` | El módulo valida el env **antes de firmar** y aborta — nunca firma una tx que saldría sin tag (ésta no se puede taggear después). |
| El dominio de la API cambia a futuro | `setAgentURI(agentId, nuevo)` desde la wallet del agente (gas mínimo, tag incluido) y actualizar el endpoint. |
| Transferencia accidental del NFT | La transferencia **borra** `agentWallet` del registro; el nuevo dueño tiene que re-setearla con firma. Regla operativa: no transferir este NFT nunca. |
| Deseo de ensayar primero en Sepolia | El registry testnet es `0x8004A818BFB912233c491871b3d84c89A494BD9e`; el flujo del script es el mismo cambiando de network. Ojo: **el hackathon sólo cuenta mainnet (chain id 42220)**; Sepolia es ensayo, no entrega. |

## 8. Esfuerzo y cronograma

| Bloque | Tiempo estimado |
| --- | --- |
| Paso 0 — config, fondeo, tag | 30 min |
| Paso 1 — módulo `erc8004.ts` | 45 min |
| Paso 2 — script CLI | 30 min |
| Paso 3 — endpoint `agent.json` | 30 min |
| Paso 4 — registro real + cierre del entry | 30 min |
| Verificación (§6) | 30 min |
| **Total** | **~3,5 h de trabajo, más el fondeo externo** |

Con deadline el 9/11 queda margen holgado, pero el fondeo de la wallet
(interchange/on-ramp) es la única parte fuera del repo y la de mayor latencia
posible — arrancarla primero. Después del registro real, correr
`loops evaluate` del sponsor LatAm para ver dónde quedó flojo el criterio
"Real use of wFIAT and the Celo stack".

## 9. Referencias

- Guía Celo 8004: <https://docs.celo.org/build-on-celo/build-with-ai/8004>
- EIP-8004 (spec): <https://eips.ethereum.org/EIPS/eip-8004>
- Explorador de identidades: <https://8004scan.io/>
- Repos del estándar: <https://github.com/erc-8004/erc-8004-contracts>
- Attribution tags: <https://github.com/celo-org/attribution-tags> (y el
  patrón ya implementado en `apps/api/scripts/escrow-lib.ts`)
- Fee abstraction: <https://docs.celo.org/build/fee-abstraction/overview.md>
- ADR-0003 (wallet por Traveler, enmienda de identidad):
  `docs/adr/0003-agent-wallet-per-traveler.md`
- MCP server: `docs/mcp.md` · x402: `X402_SETUP.md`
