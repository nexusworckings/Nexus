# CAMBIOS.md — Nexus

Memoria de evolución. Solo entran acá cambios de **arquitectura, módulos, reglas o
decisiones importantes** — no es un changelog de commits, para eso está git.

Repositorio: https://github.com/nexusworckings/Nexus

---

## 2026-08-19 — Configuración de secrets de Supabase en el Worker `nexus-production`

- **Objetivo:** resolver los errores de producción `"Invalid API key"` (`/health`) y
  `"supabaseKey is required."` (`/chat`) causados por la ausencia de
  `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_ANON_KEY` en el Worker (ver CAMBIOS 2026-08-17,
  "Pendiente").
- **Verificación de identidad:** se confirmó vía API de Cloudflare que el token local
  pertenece a la cuenta **NexusWorckings** (account id `57de15affd59c937759222091bcd23bf`),
  donde existen `nexus`, `nexus-production`, `tecno-san-juan` y `tecno-san-juan-production`.
  `nexus-production` es el Worker real (2 deployments; último 2026-08-17T04:28Z).
- **Cambio (solo secrets, sin código ni configuración de repo):**
  `wrangler secret put` en `nexus-production` para `SUPABASE_ANON_KEY` y
  `SUPABASE_SERVICE_ROLE_KEY` (valores leídos del archivo local de credenciales,
  nunca impresos ni escritos en el repo). Wrangler v4 creó un deployment nuevo por
  secret (03:18 y 03:19 UTC) → no fue necesario deploy manual adicional.
- **Verificación de secrets:** ambos nombres presentes en la configuración del Worker
  (`type: secret_text`). Sin exponer valores.
- **Resultado en producción:** el error cambió de "Invalid API key" /
  "supabaseKey is required." a **`504 PGRST003 "Timed out acquiring connection from
  connection pool."`** en `/health` y timeouts en `/api/public/business-info` y `/chat`.
  Diagnóstico: las keys **ya autentican correctamente** contra el proyecto
  `iqbbdrgajlhkfbvsvzto` (el root de `/rest/v1/` responde `401 "Only the service_role
  API key can be used"` en lugar de "Invalid API key"), pero **PostgREST no obtiene
  conexión de la DB** — auth (GoTrue) y storage responden OK, el pooler responde al
  handshake SCRAM (compute vivo), pero toda query a tablas (anon y service_role)
  se cuelga en el pool → problema del lado de Supabase (pool saturado o proyecto en
  estado limitado), pendiente de resolver en el dashboard de Supabase.
- **Pendientes:** (1) resolver el timeout del pool de Supabase (dashboard, fuera del
  repo); (2) verificar de nuevo `/health`, `/api/public/business-info` y `/chat` cuando
  el pool responda; (3) rotar el `CLOUDFLARE_API_TOKEN` del repo hacia la cuenta
  `NexusWorckings` si corresponde (el secret actual despliega a la cuenta personal
  `cuatrinismaelabrahan`).

---

## 2026-08-17 — Fix de despliegue: reconexión frontend público/admin con el backend Worker

- **Causa raíz (diagnóstico verificado contra el despliegue real, no hipótesis):** el
  commit `d070053` renombró el Worker en `backend/worker/wrangler.toml` de
  `tecno-san-juan` a `nexus` y eliminó las secciones `[env.production]`/`[env.development]`.
  El CI (`.github/workflows/deploy-worker.yml`) sigue ejecutando
  `npx wrangler deploy --env production`; sin `[env.production]`, Wrangler despliega
  al Worker **`nexus-production`** (log del run 31979557265: "Uploaded nexus-production").
  El frontend (público y admin) quedó apuntando a `https://nexus.cuatrinismaelabrahan.workers.dev`
  (SIN el sufijo `-production`), que es un Worker de Static Assets que solo sirve el
  HTML y devuelve `404` vacío en `/api/*`. Por eso el HTML cargaba pero toda llamada
  a la API fallaba: el código real del router vive en `nexus-production`, no en `nexus`.
- **Segunda causa (independiente):** incluso `nexus-production` (que sí ejecuta el
  router correcto) responde `503/500` porque el secret de Supabase es inválido/ausente
  (`/health` → `{"error":"Invalid API key"}`; `/chat` → `"supabaseKey is required."`).
  `wrangler.toml` define `SUPABASE_URL` en `[vars]`, pero `SUPABASE_SERVICE_ROLE_KEY`
  y `SUPABASE_ANON_KEY` deben configurarse como secrets del Worker de producción.
- **Cambios de código (mínimos):**
  - `index.html`, `js/api.js`, `admin/js/api.js`, `admin/js/ai-assistant.js`,
    `admin/js/components/FormBuilder.js`: API base → `https://nexus-production.cuatrinismaelabrahan.workers.dev`.
  - `backend/worker/src/middleware/cors.js`: se agregaron `https://nexusworckings.github.io`
    y `https://nexus.cuatrinismaelabrahan.workers.dev` a `ALLOWED_ORIGINS` (origenes
    reales verificados que sirven el frontend desplegado y quedan cross-origin contra
    `nexus-production`). No se agregó ningún dominio por precaución.
- **Pendiente (no resuelto por falta de credenciales locales):** setear los secrets
  de Supabase en el Worker `nexus-production` (`wrangler secret put
  SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`) y redirigir `tecnosanjuan.com`
  (hoy no resuelve DNS) si se quiere usar el dominio propio.
- **Verificación:** suite completa **1885/1885 en 103 archivos**. Endpoints probados
  contra el despliegue real (ver INFORME en la respuesta de este cambio).

---

## 2026-08-12 — P10: persistencia de entrevistas multi-turn en WhatsApp (Alternativa A implementada)

- **Objetivo:** que una entrevista iniciada por WhatsApp continúe entre mensajes. Antes, `webhook-handler.js` llamaba a `ChatRuntime.handleMessage` con `sessionId = conversationId` y **sin** `interviewSessionId`; la entrevista se creaba con UUID de `StateKeeper`, así que el turno siguiente `hasActiveInterview(conversationId)` era `false` y la respuesta caía al engine general (hallazgo crítico de la auditoría POST-P9).
- **Solución (Alternativa A de la auditoría):** guardar `interviewSessionId` en `ConversationMemory` con la API pública (`remember`/`recall`/`forget`), cambio localizado en `webhook-handler.js`. Reproduce el patrón de Web Chat (`chat.js` conserva `body.interview.sessionId`). NO se tocó `InterviewController`, `StateKeeper`, `InterviewRouter`, `ChatRuntime` ni `ConversationMemory` (quedan como estaban).
- **Cambios de código:**
  - `webhook-handler.js` (`#processMessage`, bloque runtime):
    - Constantes `INTERVIEW_SESSION_KEY = 'interviewSessionId'` y `INTERVIEW_SESSION_TTL_MS = 24 * 60 * 60 * 1000`.
    - Antes de `handleMessage`: `recall(conversationId, INTERVIEW_SESSION_KEY)` y se pasa `interviewSessionId` en la llamada (el runtime ya lo acepta, `chat-runtime.js`).
    - Después de la respuesta: si `response.type === 'interview' && response.sessionId` → `remember(...)` (inicio, continuación y ayuda refrescan el ID); si `response.type === 'completed'` o `'chat'` → `forget(...)` (completitud, cancelación y estado obsoleto limpian la clave). Las actualizaciones ocurren solo tras una respuesta exitosa (si `handleMessage` lanza, la memoria no se corrompe).
- **Comportamiento resultante:** el webhook recuerda el ID al iniciar/avanzar, lo recupera para el siguiente turno (la entrevista continúa), y lo limpia al completar, cancelar o cuando el runtime ya no lo usa (respuesta `chat` con clave recordada → sesión no continuable/stale segura). No inventa IDs: si no hay clave recordada o expiró, el runtime cae al comportamiento seguro existente (`hasActiveInterview` false → engine).
- **Cancelación segura:** `ChatRuntime.#formatInterviewAnswer` mapea `result.cancelled` → `{ type: 'chat' }` (sin sessionId); el webhook la trata como `chat` → `forget`. El controller ya elimina la sesión en CANCEL (`interview-controller.js`).
- **Concurrencia sin bloqueo:** los mensajes de una misma conversación se procesan secuencialmente (`await` del `#processMessage` en el loop); recall/remember es isócrono; los IDs de entrevista son UUID únicos, sin mezcla. Limitación documentada: dos POST concurrentes de la misma conversación pueden intercalarse (no se agrega lock; la arquitectura actual no lo requiere y la idempotencia por `messageId` ya cubre duplicados).
- **Tests (11 nuevos en `whatsapp-interview-persistence.test.js`):** asociación al iniciar; recall del mismo ID en el turno siguiente; multi-turn al mismo ID; limpieza al completar; limpieza al cancelar; nueva entrevista con ID distinto tras completar; aislamiento entre conversaciones (A/B); chat normal sin crear sesión; `forget` de un ID stale cuando el runtime responde `chat`; paso de `sessionId`/`conversationId` al runtime (persistencia P9 intacta); sin `conversationMemory` configurado no rompe. El stub simula el routing de `ChatRuntime` (activo/stale/nuevo).
- **Verificación:** suite completa **1885/1885 en 103 archivos** (1874 previos + 11 nuevos). Prettier OK en los 2 archivos tocados (P10 no agrega deuda de formato; `format:check` global sigue en ~169 archivos pre-existentes).
- **Limitaciones documentadas:** `ConversationMemory` vive en el proceso del Worker (se pierde al reiniciar/aislar — el vínculo es de corto plazo; la fuente de verdad de la entrevista sigue siendo Supabase). No se agrega tabla nueva. El vínculo por `conversationId` persistido en Supabase (Alternativa C) queda como solución a mediano plazo para sobrevivir reinicios y múltiples aislamientos.

---

## 2026-08-12 — Cierre de auditoría POST-P9: hallazgo crítico WhatsApp + memoria actualizada

Sin cambios de código (regla: primero arquitectura, después implementación).
Informe completo: `INFORME-AUDITORIA-POST-P9.md`.

- **Hallazgo 🔴 CRÍTICO — WhatsApp multi-turn interview persistence.** El
  webhook (`webhook-handler.js`) llama a `ChatRuntime.handleMessage` con
  `sessionId = conversation.conversationId` y **sin** `interviewSessionId`. La
  entrevista se crea con un UUID propio de `StateKeeper`, así que en el siguiente
  turno `activeInterviewId = conversationId` y `hasActiveInterview(conversationId)`
  es `false`: la respuesta del usuario cae al engine general y la entrevista
  **nunca continúa** en WhatsApp. `response.sessionId` se descarta en el webhook;
  Web Chat sí funciona porque conserva `body.interview.sessionId`
  (`chat.js:202,217` + `js/chatbot.js:89-93`). Sin test que cubra el camino
  (`whatsapp-integration.test.js` mockea respuesta `type: chat`).
- **Diseño de arquitectura (sin implementar):**
  - **A — Corto plazo (recomendado):** guardar `interviewSessionId` en
    `ConversationMemory` (remember al iniciar/avanzar, recall para el siguiente
    turno, forget al completar). Cambio único localizado en `webhook-handler.js`
    usando la API pública; NO toca `InterviewController`/`StateKeeper`.
  - **C — Mediano plazo:** enlace por `conversationId` persistido en Supabase
    (fuente de verdad según REGLAS.md); sobrevive reinicios/aislados.
  - **B — Vínculo en la entidad de conversación:** descartada por costo/beneficio.
- **Divergencias adicionales registradas:** wiring de tools web (4 comerciales)
  vs WhatsApp (todas, P7 ya reportado); persona del system prompt web
  (`DEFAULT_SYSTEM_PROMPT` español, `context.js:4`) vs WhatsApp
  (`profile-manager` customer en inglés, `whatsapp-webhook.js:99-111`);
  `contextManager` null en webhook.
- **Correcciones de `.ai/` vs código real** (REGLAS.md:103): flujo WhatsApp NO
  pasa por `handlers/chat.js` → el router dispara `handlers/whatsapp-webhook.js`
  (engine + `ChatRuntime` propios). Corregido en `README.md` y `MODULOS.md`;
  nueva nota en `REGLAS.md` y decisión pendiente en `DECISIONES.md`.
- **Verificación:** suite completa **1874/1874 en 102 archivos** (no se tocó
  código; baseline corroborado).

---

## 2026-08-11 — P9: persistencia de entrevistas → Conversation Context

- **Objetivo:** el resultado estructurado de una entrevista completada alimenta el contexto conversacional para el siguiente turno ("¿Cuánto cuesta?" después de completar una solicitud de reparación de un Motorola G32). Antes, `ChatRuntime` retornaba al completar la entrevista sin pasar por `engine.process()` ni `ConversationContextOrchestrator.resolve()`, por lo que device/service/product/problem jamás llegaban al contexto.
- **Auditoría real (mapa verificado):** `chat-runtime.js` tiene dos bypass: (a) entrevista activa → `answerMessage` y retorno directo; (b) inicio de entrevista (`classification.action && classification.interview && !classification.query`) → `startInterview` y retorno directo. El flujo web (`handlers/chat.js`) y el de WhatsApp (`whatsapp-webhook.js` + `webhook-handler.js`) usan el MISMO `ChatRuntime` → un solo punto de integración cubre ambos canales. `ConversationContextOrchestrator` no exponía método para inyectar entidades pre-extraídas (solo `resolve`/`getContext`); no existía la clave `problem` (requerida por P11).
- **Cambios de código:**
  - `conversation-context-orchestrator.js`:
    - Nueva clave de entidad **`problem`** en `PERSISTENT_ENTITY_KEYS` (descripción del problema ligada al tópico; se resetea en `deviceChanged` y `productChanged` como `service`).
    - Nuevo método público **`resolveEntities(entities, sessionId)`**: fusiona entidades pre-extraídas aplicando el MISMO ciclo de vida que `resolve()` (merge por `ENTITY_KEYS`, resets `deviceChanged`/`productChanged`) sin re-extraer mensaje. Canonicaliza `device` en texto plano (ej. "Samsung A54" → `{device, brand, model}`) reutilizando `#extractDevice` (P8). Devuelve `{ context, entities, changed }`.
  - `interview-context.js` (**nuevo**): puente puro schema → entidades P8. `mapInterviewEntitiesToContext({ schemaId, completedFields })` mapea:
    - `repair-request` → `device`, `problem`, `clientName`, `urgency` (`urgent`→`urgente`, `normal`→`normal`), `service="Reparación"`.
    - `budget-request` → `clientName`, `service` por `serviceType` (`reparacion`→Reparación, `accesorio`→Compra de accesorio, `impresion_3d`→Impresión 3D, `otro`→sin service).
    - `print-order` → `clientName`, `product` (objectDescription), `material`, `color` (primero de `colors[]`), `quantity` (number, acepta string numérico).
    - `impresion_3d` → `clientName` (nombre), `material`, `color`, `quantity` (cantidad).
  - `chat-runtime.js`: nuevo privado **`#persistInterviewEntities(conversationSessionId, interviewSessionId)`** invocado al completar (resultado de `answerMessage` o `startInterview` con `interviewComplete === true`). Lee la sesión de entrevista vía `interviewRouter.getInterviewSession`, mapea a entidades y las fusiona con `orchestrator.resolveEntities(entities, conversationSessionId)`; si el `ContextManager` ya tiene la sesión, sincroniza `session.conversationContext`. **Degradación silenciosa**: sin sessionId, sin orchestrator, sesión inexistente o error de lectura NO bloquea el flujo (se preserva el comportamiento previo).
- **Decisiones:**
  - **Punto de integración único en `ChatRuntime`** (no en `handlers/chat.js` ni en el webhook): ambos canales ya lo usan. La inyección ocurre en el turno de completitud; el turno siguiente re-extrae y MERGEA en `#resolveConversationContext` con el estado ya persistido en el orchestrator.
  - **`problem` como entidad P8**: se agrega a `ENTITY_KEYS` porque P11 requiere acceso a `problem` en el turno siguiente. Es identidad ligada al tópico (no dato comercial) y se resetea al cambiar dispositivo/producto. No se extrae automáticamente del texto libre (solo llega por `resolveEntities` desde la entrevista) → no genera falsos positivos en `resolve()`.
  - **Cancelación / no completitud**: NO se inyecta nada (Paso 16). Se conserva el contexto previo sin destruir.
  - **Re-completitud (P17)**: `resolveEntities` sobrescribe valores con los del turno actual y respeta el ciclo de vida; re-completar no duplica entidades ni corrompe el contexto (merge por claves).
  - **P2 preservado**: las entidades de la entrevista alimentan el Conversation Context (fuente de referencias y tono, `CONVERSATION_CONTEXT_RULE`), NO activan el Commercial Gate (que solo acepta `success === true` de tools reales).
  - **Sin DB nueva**: la persistencia es la ya existente (orchestrator en memoria + `interview_sessions` en Supabase + KV web). No se agrega persistencia nueva.
- **Tests agregados (23):**
  - `conversation-context-orchestrator.test.js` (+6): `resolveEntities` mergea/arrastra/canonicaliza device, respeta resets de ciclo de vida, no sobrescribe `problem` ausente, expone `changed`.
  - `interview-context.test.js` (**nuevo**, 11): mapeo de los 4 schemas, urgencia, labels de serviceType, primer color de multiselect, coerción de quantity, tolerancia a shapes sin wrapper.
  - `chat-runtime.test.js` (+5): inyección al completar por `answer` y por `start`, NO inyección si no completa o se cancela, tolerancia a fallo de `getInterviewSession`.
  - `conversation-context.integration.test.js` (+1): escenario P11 completo (entrevista Motorola G32 → "¿Cuánto cuesta?" arrastra device/problem/service/clientName al planner).
- **Verificación:** suite completa **1874/1874 en 102 archivos** (1851 previos + 23 nuevos). Prettier OK en los 5 archivos tocados por P9; `npm run format:check` sigue en **169** archivos con deuda pre-existente (no introducida por P9).
- **Pendientes deliberados (no mezclados):** `impresion_3d` en `INTENT_SCHEMA_MAP` (inconsistencia pre-existente documentada; el router usa `print-order` — el mapping de contexto ya soporta `impresion_3d` por si se habilita); anáfora de cantidad/producto; `items[]` múltiples objetos del mismo tipo.

---

## 2026-08-11 — P7: validación y contratos de argumentos de las tools

- **Objetivo:** ninguna tool se ejecuta con argumentos que violen su contrato. `ToolExecutor.#validateParams` (determinístico, sin LLM) es la última frontera: valida cada `inputSchema` declarado antes de llamar a `execute`. Se auditaron todos los schemas reales antes de tocar código.
- **Auditoría (mapa real verificado):**
  - `tools/index.js` (19 tools vía `registerTools`): `searchClient`, `searchInternet`, `searchPrice`, `searchBusinessInfo`, `searchProduct`, `searchStock` → `{query: {string, required}}`; `searchRepair/searchBudget/searchPrintOrder/searchNotifications` → `{clientId?, status?}`; `updateRepairStatus/updateBudgetStatus/updatePrintOrderStatus` → `{id req string, status req string}`; `sendWhatsApp` → `{phone req, message req}`; `createBudget/createRepair/createPrintOrder` → `{clientId req string, ...}`; `createClient` → `{name req, ...}`; `getConversation` → `{sessionId req}`.
  - `conversation-tools.js` (admin): `searchConversation` `{query req, status}`, `getConversationHistory` `{conversationId req, limit number}`, `buildWhatsAppMessage` `{template req, data req object}`, **`sendBulkWhatsApp` `{phones req array, message req, confirmed boolean}`**, `assignConversation` `{conversationId req, adminId req}`, etc.
  - `admin-tools.js`: `queryTable` `{table req, filters object, limit number}`, `updateSingle` `{table req, id req number, changes req object}`, `updateAll`, `findAndUpdate`, `createRecord`, `deleteRecord`.
  - `interview-tools.js`: `questionGenerator`, `interpreter`, `interviewController` `{action req string, data object}`.
  - `whatsapp-real-tools.js`: `receiveWhatsApp` `{payload req object}`, `sendWhatsAppReal`, `downloadMedia`, etc.
  - Ningún schema actual declara `enum` → se implementa la CAPACIDAD de enums (con tests sintéticos), sin inventar enums en schemas existentes.
- **Problemas reales corregidos en `#validateParams`:**
  - **`type: "array"` siempre fallaba** (`typeof [] === "object"` ≠ `"array"`) → cualquier `sendBulkWhatsApp` con `phones` válido habría sido rechazado. Ahora `array` se valida con `Array.isArray`.
  - **`type: "object"` aceptaba arrays** (`typeof [] === "object"`) → ahora exige objeto plano no-array (y `null` se trata como ausente, no como objeto).
  - **Sin código de error estructurado**: INVALID_ARGUMENTS y TOOL_ERROR eran indistinguibles salvo por el string. Se agrega `errorCode`.
  - **String vacío en param `required` string** (`query: ""`, `name: ""`) se aceptaba y la tool no-opaba o tiraba a nivel interno → ahora es `EMPTY_REQUIRED` (INVALID_ARGUMENTS).
  - **Enums**: soporte completo (`rule.enum`) → `INVALID_ENUM`.
- **Decisiones documentadas:**
  - **Argumentos desconocidos → ignorados (passthrough).** Se auditó el diseño: los `execute` solo leen las claves declaradas. Rechazar claves extra arriesga romper planes legítimos sin beneficio de seguridad real (la tool ignora lo que no declara). Es el comportamiento más compatible; la validación sigue cubriendo 100% de las claves declaradas.
  - **Sin coerción silenciosa.** `"30"` no se convierte a `30`; `"true"` no se convierte a `true`. El planner debe mandar el tipo correcto; las referencias de `ReferenceResolver` inyectan valores con su tipo real (los tests de integración ya usan strings solo para params string).
  - **Estados resultantes del executor** (contrato de errores estructurado, compatible con los consumidores existentes que leen `{success, error, toolName}`):
    - `SUCCESS` → `{success: true, data, toolName}`
    - `EMPTY_RESULT` → `{success: true, data: {results: []}, empty: true, toolName}` (solo cuando `data.results` es array vacío; `searchBusinessInfo` devuelve objeto → sin flag)
    - `INVALID_ARGUMENTS` → `{success: false, errorCode: "INVALID_ARGUMENTS", issues: [{path, code, message}], error, toolName}`
    - `TOOL_ERROR` → `{success: false, errorCode: "TOOL_ERROR", error, toolName}`
    - `TOOL_NOT_FOUND` → `{success: false, errorCode: "TOOL_NOT_FOUND", error, toolName}`
    - `NOT_ALLOWED` → `{success: false, errorCode: "NOT_ALLOWED", error: "Tool not allowed by profile", toolName}` (se conserva el string exacto que lee `nexus-ai-engine.js:160`)
- **Seguridad preservada:** el gate comercial (P2) ya filtra por `success === true`; un `INVALID_ARGUMENTS` (`success: false`) nunca es evidencia (test agregado).
- **Hallazgo documentado (Paso 10, NO corregido — fuera de alcance):** `customer.allowedTools` en `profile-manager.js` incluye `searchClient/searchRepair/searchBudget/searchPrintOrder/getConversation/searchNotifications`, pero el registro de runtime en `handlers/chat.js` (entrevista + 4 tools comerciales) no las registra. No rompe nada: `#getAllowedTools` (planner) filtra por `registry.get()` → el Planner solo ve las registradas, y si emitiera una no registrada el executor devuelve `TOOL_NOT_FOUND`. Es inconsistencia de wiring (chat vs whatsapp-webhook registra todo), no de validación de argumentos.
- **Tests agregados (25 nuevos):** `tool-executor.validation.test.js` (20): TOOL_NOT_FOUND; required presente/ausente; `undefined`/`null`; string vacío (`EMPTY_REQUIRED`); mismatches string/number/boolean; array válido e inválido; object rechaza array y acepta objeto; enum; argumentos desconocidos ignorados; `issues` múltiples; EMPTY_RESULT vs no-empty; TOOL_ERROR; NOT_ALLOWED vía plan; sin inputSchema → skip. `tool-executor.validation.integration.test.js` (3): paso con args inválidos **nunca ejecuta la tool** y no aborta el resto; distinguir EMPTY/INVALID/TOOL_ERROR/TOOL_NOT_FOUND en un plan. `commercial-gate.test.js` (+2): INVALID_ARGUMENTS bloquea y no produce claims.
- **No se mezcla:** P9 (persistencia de entrevistas/ContextManager), refactor de `nexus-ai-engine.js`, coerción, limpieza de perfiles.
- **Verificación:** suite completa **1851/1851 en 101 archivos** (1826 previos + 25 nuevos en 2 archivos nuevos). Prettier OK en los 4 archivos tocados por P7; `npm run format:check` sigue en 169 archivos con deuda pre-existente (no introducida por P7).

---

## 2026-08-11 — P6: contratos y solapamiento de las tools comerciales

- **Objetivo:** eliminar la ambigüedad del Planner entre `searchProduct`, `searchStock` y `searchPrice`, sin romper el Commercial Gate (P2) ni el Product Matching (P3).
- **Auditoría (mapa real verificado en código):**
  - `searchProduct` → `ProductService` → `ProductRepository` → tabla `products` → `{id, name, brand, category, price, currency, stock, available}`. Es la tool completa del producto (existencia + atributos + **precio de producto** + stock).
  - `searchStock` → `StockService` → `StockRepository` → **la misma tabla `products`** (shape acotado) → `{id, product, stock, available}`. Solo stock/unidades restantes.
  - `searchPrice` → `PriceService` → tablas `prices` + `services` → `{service, label, amount, currency}`. Solo **precios de SERVICIO de reparación** (origen de datos distinto a productos).
  - `searchBusinessInfo` → `BusinessInfoService` → `{topic, value}`. Info del negocio.
- **Problema real encontrado:** el solapamiento NO es de datos (producto/stock comparten la misma tabla `products`; `searchPrice` usa un origen distinto). El overlap real es de **decisión del Planner**: el bloque "WHEN TO USE EACH TOOL" del prompt de `planning-engine.js` solo guiaba `searchProduct` y `searchStock`; **`searchPrice` y `searchBusinessInfo` no tenían guía explícita** y nada separaba "precio de producto" (→ `searchProduct`) de "precio de servicio" (→ `searchPrice`). Riesgo: "¿Cuánto cuesta el PLA?" podía ruteársele a `searchPrice` (servicios) → resultados vacíos → bloqueo del gate (mala UX, aunque el gate ya impedía inventar).
- **Decisión arquitectónica: Opción A (refinada).** `searchProduct` permanece como la tool comercial completa del catálogo (producto + precio + stock). `searchStock` solo para intención explícita de stock. `searchPrice` solo para precios de servicio. **No se eligió la Opción B** porque no existe fuente separada de "product-price"/"product-stock" (todo vive en `products`); separarlas obligaría a mutilar `ProductRepository` (rompe P3), duplicar lógica de matching y pagar un costo alto sin justificación en el modelo de datos. Beneficio colateral de A: "¿Tenés PLA negro y cuánto sale?" se resuelve con **UNA sola llamada** a `searchProduct` (evidencia completa de disponibilidad + precio + stock sin plan compuesto).
- **Cambios:**
  - `planning-engine.js`: sección "WHEN TO USE EACH TOOL (DISTINCT CONTRACTS)" ampliada a las 4 tools comerciales. Reglas explícitas: producto (existencia/atributos/precio/stock) → `searchProduct`; stock/unidades restantes → `searchStock`; precio de **servicio** de reparación → `searchPrice` (nunca para productos: "¿cuánto cuesta el PLA?" es producto → `searchProduct`); info del negocio → `searchBusinessInfo`.
  - `tools/index.js`: descripciones de `searchProduct` (menciona explícitamente precio + stock + que no es para precios de servicio), `searchStock` (solo stock, "does NOT return price", no es catálogo ni servicio) y `searchPrice` (solo "REPAIR-SERVICE prices", "Do NOT use for product prices"). Contrato inequívoco que ve el Planner.
  - **Commercial Gate: SIN cambios de contrato.** Bajo Opción A el mapeo vigente ya es correcto: `searchProduct` → [PRODUCT_EXISTENCE, PRODUCT_ATTRIBUTE, PRICE, STOCK, AVAILABILITY]; `searchStock` → [STOCK, AVAILABILITY]; `searchPrice` → [PRICE]. `extractEvidence` ya quita PRICE de `searchStock` (items sin price) y quita PRICE de `searchProduct` si el item no tiene `price`. Solo se agregaron tests que lockean la separación.
- **Tests agregados (17 nuevos):**
  - `planning-engine.test.js` (+4): el prompt contiene contratos distintos y guía producto→`searchProduct` (no `searchPrice`), servicio→`searchPrice`, stock explícito→`searchStock`.
  - `tools/index.test.js` (+3): descripciones de `searchProduct` (price+stock), `searchPrice` (solo servicio, nunca producto), `searchStock` (solo stock, nunca precio).
  - `commercial-gate.test.js` (+4): `searchPrice` evidencia PRICE y NO STOCK/PRODUCT; `searchPrice` con query de producto vacía → block; `searchProduct` evidencia PRICE+STOCK+AVAILABILITY (product-price); `searchStock` evidencia STOCK/AVAILABILITY y NUNCA PRICE.
  - `tool-contracts.integration.test.js` (+6, archivo nuevo): end-to-end de los casos críticos (Paso 9): precio de producto → `searchProduct` con PRICE; stock explícito → `searchStock` sin PRICE; precio de servicio → `searchPrice` sin PRODUCT; mixto "¿Tenés PLA negro y cuánto sale?" → una sola `searchProduct` con PRICE+STOCK+AVAILABILITY; sin resultados → gate block (no inventa); "¿Cuánto cuesta reparar mi Samsung?" → vía `searchPrice` sin evidencia → block.
- **No se mezcla:** validación/coerción de argumentos (P7), persistencia de entrevista/ContextManager (P9), refactor de `nexus-ai-engine.js`/`tool-executor.js` (regla de REGLAS.md).
- **Verificación:** suite completa **1826/1826 en 99 archivos** (1809 previos + 17 nuevos en 1 archivo nuevo). Prettier OK en los 6 archivos tocados por P6.

---

- **Objetivo:** que `ProductService.search` rankee productos teniendo en cuenta color y material pedidos por el usuario (conecta con P8, que ya extrae `color`/`material` en la capa conversacional), respetando el orden obligatorio `PLA negro → PLA rojo → PETG negro` para la consulta "PLA negro".
- **Auditoría:** el catálogo NO tiene columnas `color`/`material`; esos tokens viven embebidos en `name` (texto libre). `ProductRepository` selecciona `id,name,brand,category,price,currency,stock,is_active`. `database/007_products.sql` define otro schema (`description,image_url,features`) sin brand/currency/stock — mismatch ya documentado como punto de integración.
- **Diseño (scoring ponderado, identidad > atributo):**
  - Identidad (matcheo previo, intacto): name `+4`, brand `+3`, category `+2`, parcial `+1`.
  - Atributos explícitos (solo tokens que el usuario pidió): color/material **presente** en el producto suma (`+2` color / `+3` material, más el matcheo de identidad); atributo pedido para el que el producto declara **OTRO** valor penaliza (**conflicto relega, no excluye**): `-1` color, `-5` material.
  - Un atributo pedido **sin ninguna evidencia** en el producto no matchea → ese producto se **excluye** (no se inventa; ej. "PLA violeta" no inventa violeta y "PLA negro" excluye un PLA sin color declarado).
  - Conflictos se evalúan solo sobre tokens explícitos; los alias del KG (`pla↔filamento`, `ssd↔disco/solido`, `ram↔memoria`, `moto↔motorola`) siguen bonificando `+2` sin exigirse.
  - `#tokenize` ahora filtra tokens numéricos puros (`!/^\d+$/`) → las cantidades ("Quiero 30 PLA negros") no rompen el matching.
- **Constantes nuevas** en `product-service.js`: `COLOR_MATCH_BONUS=2`, `MATERIAL_MATCH_BONUS=3`, `COLOR_CONFLICT_PENALTY=1`, `MATERIAL_CONFLICT_PENALTY=5`.
- **Resultados verificados (PRINT_CATALOG: f1 PLA negro, f2 PLA rojo, f3 PETG negro):**
  - "PLA negro" → `[f1, f2, f3]` (15 > 8 > 3) ✓ obligatorio.
  - "PLA rojo" → `[f2, f1]` (f3: conflictos material+color → score −4, excluido).
  - "PETG negro" → `[f3, f1]` (f2: −6 excluido; f1 queda como secundario honesto con material en conflicto).
  - "PLA" → `[f1, f2]` (f3 excluido); "PLA violeta" → `[f1, f2]` sin inventar violeta; "filamento" → `[f1, f2, f3]` (alias KG intacto); "moto" → `[]`.
- **No se toca:** `ProductRepository`, `BusinessKnowledgeGraph`, tool `searchProduct`, Commercial Gate (P2). P8 ya extrae color/material; ProductService solo interpreta su consulta.
- **Bug corregido durante implementación:** `#tokenize` devuelve un array; `#scoreAttribute` llamaba `.has()` sobre raw tokens → ahora se envuelven en `Set`.
- **Tests:** `product-service.test.js` +9 (bloque "with color/material attributes" con PRINT_CATALOG y `makePrintService`): ranking identidad+color, conflicto de color relega, conflicto de material más fuerte, material-only, no inventa color inexistente, excluye producto sin color declarado, ruido conversacional, cantidades numéricas, alias KG.
- **Verificación:** suite completa **1809/1809 en 98 archivos** (1800 previos + 9). Prettier OK en `product-service.js` y `product-service.test.js`.

--- — las descripciones/preguntas ya no inician entrevistas

- **Objetivo:** corregir falsos positivos donde una descripción, hipótesis o pregunta sobre un problema activa una entrevista aunque el usuario no solicite iniciar una acción.
- **Auditoría de `ACTION_PATTERNS` (ver informe completo en la respuesta de P1):** los patrones de `repair-request` eran casi todos descriptivos (prende/enciende/anda, se rompió, se cayó/mojó/golpeó, no funciona, batería dura poco, pantalla rota). Clasificados como 1) solicitud explícita, 2) descripción de problema, 3) pregunta/hipótesis, 4) ambigua.
- **Cambio estructural (router sigue determinístico, sin LLM):**
  - `repair-request` ahora requiere **evidencia de solicitud**: primera persona (`necesito|quiero|preciso|quisiera|me gustaría + reparar/arreglar/cambiar/poner`), `quiero/necesito que me arreglen/reparen/cambien`, imperativos (`arreglame|cambiame|reparame`), `me puedes/podés/pueden + arreglar/reparar/cambiar`, `llevar/dejar/mandar a reparar` y el sintagma nominal de servicio (`reparación|arreglo|cambio de X`). Se eliminaron los patrones puramente descriptivos.
  - `print-order`: se restringió `impresión 3d` → `impresión 3d de|para` (ya no matchea "¿qué es la impresión 3d?", "¿tenés impresión 3d?", "impresión 3d" suelto) y se agregaron solicitudes explícitas faltantes (`quiero que me imprimas/imprimas/hagan una pieza/figura`, `me podés/podrías hacer una impresión 3d`).
  - `budget-request`: sin cambios de patrones; se agregó `cuánto es` a consultas de precio para que "¿cuánto es un presupuesto de reparación?" quede gated (no inicia entrevista).
  - **Gates nuevos (antes de devolver `action`):** `HYPOTHETICAL_QUESTION_PATTERNS` (anclado al inicio: "qué hago/pasa/pasaría/haría si/con/cuando...") y `CAPABILITY_QUESTION_PATTERNS` ("¿hacen reparaciones?", "¿hacen impresión 3d de figuras?"). Ambos devuelven `none`.
  - **Antijacking preservado:** `CONSULTATION_PATTERNS` + campo `query` siguen funcionando como gate en `chat-runtime.js` (si `query` presente, no inicia entrevista). El `topic`/`query` SÍ se usa (es el gate antijacking).
- **Casos nuevos detectados y cubiertos:** "¿hacen impresión 3d de figuras?" (antes action), "¿qué es la impresión 3d?", "¿cuánto es un presupuesto de reparación?" (antes action), "el celular no enciende y no carga" (descripción), y gaps de solicitud explícita que antes no iniciaban entrevista: "Necesito llevar el celular a reparar.", "cambiame la pantalla", "arreglame el celu", "quiero que me imprimas una figura", "necesito que me impriman una pieza".
- **Tests:** `interview-router.test.js` pasó de 36 a 116 tests. Se agregaron bloques: descripciones de problema → `none`, preguntas hipotéticas → `none`, capacidad/información → `none`, antijacking (consulta → `consultation`; acción+query gated), e impresión 3d equivalentes. Se re-clasificaron 6 mensajes que antes eran "action" (descrípciones) a la categoría "no inician entrevista" por decisión de P1.
- **Verificación:** suite completa **1785/1785 en 98 archivos** (1733 previos + 52). Prettier OK en los 2 archivos tocados. `npm run format:check` reporta 171 archivos con estilo pre-existente (deuda categoría B, no introducida por P1).
- **Fix de test flaky pre-existente (determinismo):** `tool-executor.integration.test.js > tracks duration` fallaba intermitentemente bajo carga. `tool-executor.js` mide con `Date.now()` (resolución 1ms) y el test dormía 5ms esperando `>= 5ms`; la resolución podía medir 4ms. Se subió el sleep a 30ms con aserción `>= 25ms`. No toca la lógica de `tool-executor` ni es parte de P6/P7; solo elimina la intermitencia de la suite.
- **Pendientes documentados:** `selectSchema('impresion_3d')` — el schema `impresion_3d` está registrado en `BUILT_IN_SCHEMAS` pero NO está en `INTENT_SCHEMA_MAP` (el router usa `print-order`). Es una **inconsistencia independiente de P1**: no causa falsos positivos ni bloquea la corrección. Queda documentada como pendiente, NO mezclada. Además, `arreglo/reparación de X` como sintagma nominal conserva riesgo residual de falsos positivos en preguntas tipo "¿qué incluye la reparación de una pantalla?" (documentado).

---

## 2026-08-11 — P8: Entity Extraction / Conversation Context

- **Objetivo:** enriquecer la representación estructurada de lo que el usuario dice (entidades del turno) para que Planner, Responder y el futuro Product Matching consuman información útil, manteniendo la separación **Conversation Context ≠ Commercial Evidence**.
- **Auditoría del modelo previo:** `ENTITY_KEYS` = `device` (string compuesto), `service`, `product`, `clientName`, `repairId`, `budgetId`. Lo producía `ConversationContextOrchestrator.resolve()` (determinístico, en memoria, TTL 30min, tope 500). Lo consumía `nexus-ai-engine.js` (mergea `context` en `workingMemory` del Planner; lo pasa a `respondFn` del Responder, que lo serializa con `serializeConversationContext` e inyecta en el system prompt). `commercial-gate.js` NO recibe `conversationContext` (la separación es por construcción). Persistencia: solo en memoria por sesión (no DB); sobrevive al siguiente mensaje por TTL/topic, no a procesos.
- **Nuevo modelo de entidades (estructura plana, `device` sigue siendo el nombre compuesto):**
  - **Identidad:** `device`, `brand`, `model`, `clientName`, `repairId`, `budgetId`.
  - **Producto/pedido:** `product`, `quantity`, `color`, `material`.
  - **Servicio:** `service`, `urgency`, `date`.
  - **Personalización:** `logo`.
  - **Decisión documentada:** se mantiene `device` como string compuesto (`"Samsung A52"`) y se agregan `brand`/`model` planos en lugar del objeto `{ brand, model }` del ejemplo, porque los consumidores actuales son prompts LLM (JSON plano es igual de legible), preserva compatibilidad con los tests y aserciones existentes, y P3 podrá leer `brand`/`model` directo.
- **Problemas corregidos:**
  - `"Mi Samsung se cayó"` → ahora `brand: "Samsung"`, `device: "Samsung"` (antes se perdía porque el regex exigía brand + model). Extracción de device por tokens: brand + hasta 3 tokens modelo validados contra stoplist (evita "Samsung Se Cayo"; no captura "no prende", "se cayó", etc.).
  - `"Necesito imprimir 30 llaveros"` → `quantity: 30` (antes se perdía). `quantity` es número y requiere un sustantivo de producto/impresión adjunto (evita precios/teléfonos).
  - `"Quiero PLA negro"` → `product: "PLA"`, `material: "PLA"`, `color: "negro"`.
  - `"Necesito 30 llaveros negros de PLA"` → `quantity: 30`, `color: "negro"`, `material: "PLA"`, `product: "Llavero"` (extracción de producto por **primera coincidencia en el texto**, no orden de reglas).
  - `"Necesito reparar el celular urgente"` → `service: "Reparación"`, `urgency: "urgente"`.
  - `date` (días de semana, hoy/mañana, "el N de mes") y `logo` (bool).
  - Se agregan productos de impresión 3D y materiales (llaveros, figuras, escudos, tazas, piezas, PLA, ABS, PETG, TPU, resina, filamento…).
- **Ciclo de vida:** identidad (`device`, `brand`, `model`, `service`, `product`, `clientName`, `repairId`, `budgetId`) persiste entre turnos; los atributos de pedido (`quantity`, `color`, `material`, `urgency`, `date`, `logo`) persisten mientras el tópico (`device`/`product`) no cambie, y se resetean al cambiar `product` (y junto con `service`/`product` al cambiar `device`). La anáfora simple ("¿Tenés tres?", "¿y eso?") sigue resolviéndose por arrastre de contexto (sin inventar valores comerciales); resolución completa de anáforas queda para P2.
- **Múltiples objetos:** el modelo sigue siendo escalar por clave. En un mismo mensaje conviven entidades de distinto tipo sin pisarse ("Quiero reparar mi Samsung A52 y además comprar un cargador" → device + brand + model + service + product). **Dos objetos del MISMO tipo en un mensaje no se soportan** (el contexto es "el tópico actual"); se propone para una fase posterior la estructura mínima `entities.items = [{ type, product, quantity, color, material, ... }]`. Documentado, NO mezclado.
- **No se toca:** `ProductService.#score`, product matching, tool overlap, ToolExecutor validation, interview persistence, Commercial Gate (regresión: se agregó test que verifica que `entities` nunca contiene `stock`/`price`), InterviewRouter.
- **Tests:** `conversation-context-orchestrator.test.js` 36 → 50; `conversation-context.integration.test.js` +1 (las entidades llegan al prompt del Planner: `quantity`/`color`/`material`). Total **1800/1800 en 98 archivos** (1785 previos + 15).
- **Prettier:** los 4 archivos tocados pasan. `npm run format:check` → 169 archivos con deuda pre-existente (bajó de 171; no introducida por P8).
- **Pendientes deliberados para P3/P7/P9:** múltiples objetos del mismo tipo (`items[]`); resolver anáfora "¿Tenés tres?" hacia cantidad/producto como entidad (hoy se resuelve por arrastre); `impresion_3d` en `INTENT_SCHEMA_MAP` (inconsistencia pre-existente documentada, no tocada).

---

## 2026-08-11 — P2: Commercial Gate determinístico contra alucinaciones comerciales

- **Objetivo:** ninguna afirmación de dato comercial dinámico (precio, stock, disponibilidad, existencia de producto, características comerciales, estado de reparación, presupuesto, hechos del negocio) sin evidencia verificable en el turno actual.
- **Nuevo módulo** `services/nexus/commercial-gate.js` (puro, sin estado, decide ANTES de que el LLM genere):
  - `CLAIM_TYPES`: PRICE, STOCK, AVAILABILITY, PRODUCT_EXISTENCE, PRODUCT_ATTRIBUTE, REPAIR_STATUS, BUDGET, SERVICE_FACT.
  - `COMMERCIAL_TOOL_CLAIMS`: fuentes autorizadas = searchProduct, searchPrice, searchStock, searchBusinessInfo, searchRepair, searchBudget. `searchInternet` (web general) NO es evidencia comercial.
  - `classifyCommercialIntent` (via tools planeadas + clasificador mínimo explícito), `extractEvidence` (diferencia tool no planeada / vacía / con resultado / falló; `ID_ANCHORED_TOOLS` para searchRepair/searchBudget exigen id/clientId), `buildSafeFallback` (fallback determinístico, nunca inventa montos), `buildCommercialPolicy` (política inyectada en modo allow) y `evaluateCommercialGate` → `{ status: 'none'|'allow'|'block', intent, evidence, fallback, commercialPolicy }`.
  - Decisión: `none` (no comercial → normal), `block` (comercial sin evidencia → fallback sin llamar al LLM), `allow` (evidencia presente → generar con la política comercial).
- **Wiring:** `nexus-ai-engine.js` (`commercialGate` en constructor; `#generateResponse` corre el gate antes del LLM; `#runResponder` inyecta `commercialPolicy`); `handlers/chat.js` y `handlers/whatsapp-webhook.js` (`commercialGate: evaluateCommercialGate`); `context.js` (`buildMessages` acepta `options.commercialPolicy` en el system prompt).
- **Tests:** `commercial-gate.test.js` (23) + `commercial-gate.integration.test.js` (5) → casos A–G, negativos de seguridad (searchInternet/entities/tool no planeada no son evidencia; bloqueo), helpers y comportamiento del engine.
- **Ajuste de test pre-existente:** `chat.persistence.test.js` "persists conversation history..." ahora requiere 3 valores de mock (la consulta comercial "cuanto sale un cargador" es bloqueada por el gate → no se llama `respondFn`).
- **Verificación:** suite completa 1733/1733 en 98 archivos (1705 previos + 28 nuevos). Prettier OK en los archivos tocados.

---

## 2026-08-11 — Reproducibilidad del entorno: Node 22 fijado con Volta (Windows + Linux)

- **Objetivo:** que Nexus se pueda ejecutar en cualquier computadora Windows o Linux sin depender de una instalación global de Node ni de `apt`/`nvm` particulares.
- **Versión exacta:** CI (`deploy-worker.yml`) usa `node-version: 22`. Se verificó en el índice oficial que la v22 LTS actual es **22.23.2** (Jod) — es la versión que Volta fija.
- **`backend/worker/package.json`:** se agregó `"volta": { "node": "22.23.2" }` y `"engines": { "node": ">=22 <23" }`. Nuevo script `format:check` (`prettier --check .`).
- **Nuevo `.nvmrc`** en `backend/worker` con `22.23.2` para usuarios que prefieran nvm (`nvm use`).
- **README.md:** sección "Local Installation" reemplazada por "Development Environment" con requisitos, instalación de Node 22 (Volta, instrucciones separadas Linux/Windows), `npm ci` como procedimiento principal (no `npm install`), variables de entorno, inicio, tests, lint (no hay linter configurado; sólo Prettier) y verificación de formato. Se corrigió el conteo de tests a 1705/96.
- **Verificación en este host (Ubuntu 26.04, sin Node previo):** Volta 2.0.2 + Node v22.23.2 + npm 10.9.8. `npm ci` OK. `npm test` → 96 archivos / 1705 tests pasan. `prettier --check .` → 177 archivos con estilo pre-existente fuera de default (deuda previa, categoría B; `business-context.js` y su test fueron ajustados para pasar).
- **Nota:** `npm audit` reporta 5 vulnerabilidades (2 moderate, 3 high) pre-existentes; sin corregir en esta tarea.

---

## 2026-08-11 — Business/Policy Context canónico + inyección de Conversation Context en el Responder (Phases 2-3)

- **Nuevo módulo** `services/nexus/business-context.js` (fuente canónica):
  - `composePlannerContext(policy, persona)`: compone el system prompt del Planner a partir del Business/Policy Context y la persona del perfil. Si no hay policy, devuelve solo la persona (comportamiento previo, sin regresión).
  - `buildConversationContextData(context)` / `serializeConversationContext(context)`: envuelven las entidades resueltas por el Orchestrator en el formato estructurado `{ entities, references, state }` (JSON) para inyectarlas como datos estructurados, no como texto suelto. `references`/`state` quedan reservados para anáfora y estado conversacional en fases posteriores.
  - `CONVERSATION_CONTEXT_RULE`: regla que aclara que el contexto conversacional es fuente de referencias y tono, NO fuente de datos comerciales.
- **`context.js`**: `resolveBusinessContext(env)` devuelve el Business/Policy Context estructurado y congelado `{ policy, fallback, source, version }`; `buildMessages()` acepta `options.policy` y `options.conversationContext` e inyecta el contexto conversacional en el system prompt del Responder.
- **Wiring**:
  - `nexus-ai-engine.js`: `#buildPlannerSystemPrompt(persona)` compone policy + persona; `#generateResponse` ya propaga `conversationContext` al `respondFn`.
  - `handlers/chat.js`: `respondFn` construye `businessPolicy` vía `resolveBusinessContext` y serializa el contexto conversacional del turno con `serializeConversationContext` para pasarlo a `buildMessages`.
  - `handlers/whatsapp-webhook.js`: usa `businessPolicy` (mismo `resolveBusinessContext`) como `policyContext` del engine.
- **Tests:** `business-context.test.js` (Vitest) cubre `composePlannerContext`, `buildConversationContextData`, `serializeConversationContext` y versión.
- **Fixes de integridad:** `context.js` presentaba corrupción previa (líneas duplicadas y una referencia a `utf8` inexistente); se reconstruyó el archivo limpio y se verificó balance sintáctico (no hay runtime de Node disponible en el entorno para ejecutar `vitest`/`prettier`).

---

## 2026-08-03 — Fix definitivo del primer mensaje en producción y limpieza de logs de diagnóstico

- **Causa raíz encontrada:** `AIAdapter` aliasaba `globalThis.fetch` en un campo
  privado y lo invocaba como `this.#fetch(...)`. En el runtime de Cloudflare
  Workers el `fetch` nativo exige el scope global como receptor; con la instancia
  de `AIAdapter` como `this` lanzaba `TypeError: Illegal invocation`, envuelto
  como `AINetworkError` y tragado en silencio por el `catch` de `start()`. El
  sistema parecía funcionar por el fallback heurístico; la extracción IA real
  nunca corría en producción. En tests y en Node local no fallaba porque se
  inyecta un fetch mock y el fetch de Node no es sensible al receptor.
- **Fix 1 (`f41efcb`):** `ai-adapter.js` — `globalThis.fetch.bind(globalThis)`
  preserva el receptor correcto en Workers; los mocks inyectados en tests no se
  tocan.
- **Fix 2 (`57d24cd`):** `interview-router.js` — `startInterview()` ahora propaga
  `summary` desde `InterviewController.start()`. Antes se descartaba y el usuario
  recibía el fallback genérico "Solicitud procesada correctamente." en lugar del
  `summaryTemplate` del schema.
- **Diagnóstico con logs temporales:** se agregaron `[Interpreter:RAW]`
  (`8fe2999`), `[Interpreter:AI_ERROR]` y `[ChatRuntime:ROUTE]` (`2485025`) para
  localizar el punto de falla. Una vez confirmados los fixes en producción, se
  eliminan los tres. El log permanente `[AIAdapter]` se conserva.
- **Verificado en producción:** el mensaje "Hola, se me cayó el Samsung S23 al
  agua, soy Juan, mi número es 3405806523" extrae `clientName`, `clientPhone`,
  `device` y `problem`, completa la entrevista en el primer turno y responde con
  el `summaryTemplate` del schema.
- **Tests:** 1360 pasan / 12 fallan (los mismos tests stale de
  `interview-router.test.js`).

---

## 2026-08-03 — Fix: contrato de claves entre Interpreter y schemas de Interview

- **Motivo:** el primer mensaje se persistía e interpretaba, pero los campos
  extraídos no se aplicaban porque el LLM devolvía claves genéricas (`name`,
  `phone`, `equipment`, `issue`) en lugar de los `field.id` exactos del schema
  (`clientName`, `clientPhone`, `device`, `problem`).
- **Cambio:** se actualizó el system prompt de `interpreter.js` para exigir
  explícitamente que las claves del objeto `fields` coincidan exactamente con
  los `field.id` definidos en el schema. Se agregaron ejemplos correctos e
  incorrectos.
- **Comportamiento:** cuando el LLM respeta los IDs del schema, el primer
  mensaje alimenta `InterviewController.start()` y los campos válidos se aplican
  automáticamente. Si el mensaje completa todos los campos requeridos, la
  entrevista finaliza en el primer turno.
- **Tests:** 1360 pasan / 12 fallan. Los 12 fallos siguen siendo los tests stale
  de `interview-router.test.js`.

---

## 2026-08-03 — Primer mensaje: persistencia y aplicación automática de campos válidos

- **Motivo:** el mensaje inicial que dispara una entrevista (ej. "Hola, se me
  rompió la pantalla del iPhone, soy Juan, mi teléfono es 123456789") contenía
  datos útiles que se descartaban; el sistema volvía a pedir nombre, teléfono y
  problema.
- **Cambios implementados:**
  - `services/interview/v2/interview-controller.js`: `start(schema, message)`
    ahora acepta un mensaje opcional, lo guarda en `state.metadata.initialMessage`
    y, si hay `Interpreter`, extrae campos y aplica los que sean válidos según el
    schema.
  - Nuevo helper privado `#applyExtractedFields` reutilizado por `start` y
    `answerMessage` para mantener una sola lógica de validación/aplicación.
  - `services/nexus/interview-router.js`: `startInterview(schemaId, message)`
    reenvía el mensaje original al controller.
  - `services/nexus/chat-runtime.js`: pasa el mensaje del usuario a
    `startInterview` cuando se detecta una intención de entrevista.
  - Tests en `services/interview/v2/interview-controller.test.js`: cobertura de
    metadata `initialMessage`, seeding de campos válidos, descarte de campos
    inválidos y comportamiento sin `Interpreter`.
- **Comportamiento:** la entrevista avanza según los campos que ya pasaron
  validación; los inválidos se descartan sin bloquear el flujo. Si el mensaje no
  aporta campos válidos, la entrevista comienza desde la primera pregunta.
- **Tests:** nuevo baseline `1360 pasan / 12 fallan` en `backend/worker`. Los 12
  fallos siguen siendo los tests stale de `interview-router.test.js` (regex High
  Precision); no se introdujeron nuevos fallos.

---

## 2026-08-03 — Baseline de tests y tests stale detectados

- Se ejecutó `npm test` en `backend/worker`: **1357 tests pasan, 12 fallan**.
- Los 12 fallos están en `src/services/nexus/interview-router.test.js`: el test
  espera que frases como `"no funciona mi equipo"`, `"pantalla rota"`,
  `"quiero saber el precio"`, `"presupuesto de reparación"`, `"necesito un diseño 3d"`
  inicien entrevistas, pero los patrones regex actuales (más estrictos tras el
  ajuste de 2026-07-30) no las matchean.
- Esto indica que los tests quedaron desactualizados respecto a la decisión de
  **High Precision** (no High Recall) del `InterviewRouter`.
- Se registra este baseline; los tests no se modifican en Cambio 0 porque el
  objetivo es consolidar el estado actual. Se abordarán en un cambio posterior.

---

## 2026-08-03 — Corrección de inconsistencia detectada entre `.ai/` y el código

- Se detectó que `backend/worker/src/services/interview/v2/schemas/repair-request.json`
  tenía `minimumRequired` eliminado en el working tree, mientras que
  `print-order.json` y `budget-request.json` aún conservaban `minimumRequired: 2`.
- Se corrigió `.ai/README.md` y `.ai/DECISIONES.md` para reflejar el estado real
  del código: decisión tomada de eliminar el campo, pero implementación parcial
  en este momento.
- Esta corrección aplica la regla: **el código es la fuente de verdad**.

---

## 2026-08-03 — Cambio 6: eliminar `minimumRequired` de todos los schemas de Interview

- **Motivo:** con `minimumRequired: 2`, las entrevistas finalizaban tras nombre
  + teléfono, sin recopilar datos del negocio (equipo, problema, pieza, material,
  cantidad, tipo de servicio, descripción).
- **Cambio:** se elimina `minimumRequired` de `print-order.json` y
  `budget-request.json` (ya estaba eliminado de `repair-request.json`).
- **Comportamiento:** ahora las entrevistas completan cuando todos los campos
  `required` no-skipped están respondidos.
- **Nota:** campos opcionales al final del `fieldOrder` (`urgency` en
  `repair-request`, `contact` en `budget-request`) no se preguntan porque la
  entrevista ya completó los requeridos. Cambiar eso requiere marcarlos como
  `required: true` o modificar la semántica del motor — fuera de alcance de este
  cambio.
- **Tests:** baseline 1357 pasan / 12 fallan en `interview-router.test.js` por
  tests stale. No se introdujeron nuevos fallos.

---

## 2026-08-03 — Nueva regla de mantenimiento de `.ai/`

- Se agrega a `.ai/REGLAS.md` la regla: **la memoria estructurada describe
  siempre el estado actual del proyecto**; las funcionalidades planificadas o
  futuras deben identificarse explícitamente como tales y nunca presentarse como
  implementadas.

---

## 2026-08-03 — Arquitectura v1 definida y plan revisado

- Se define oficialmente la **Nexus Architecture v1** en `.ai/README.md`, con
  capas claras: Adaptadores → Dominio → Infraestructura, y principios de diseño
  para soportar Tool Calling, MCP, agentes especializados y nuevos canales.
- Se documenta el **Completion Pipeline** (`services/completion/`) como módulo de
  dominio planificado: único punto de orquestación para crear registros de
  negocio al completar una entrevista, invocable desde web, WhatsApp y futuras
  tools/agentes.
- Se corrige la memoria respecto a Cloudflare KV: las sesiones de entrevista v2
  viven únicamente en Supabase (`interview_sessions`); KV es legacy para
  sesiones de conversación.
- Se registra la decisión de eliminar `minimumRequired` de los schemas de
  entrevista y usar la completitud por campos requeridos.
- Se documenta la estrategia de 3 etapas para el primer mensaje de una
  entrevista: persistir → extraer sugerencias → aplicar con compuerta de
  confianza.
- Se establece que no habrá modo dry-run técnico: la validación de datos
  completados será un flujo de trabajo del panel admin (`repairs.status='received'`,
  `budgets.status='pending'`).
- Se actualizan `.ai/MODULOS.md` y `.ai/REGLAS.md` para reflejar el estado real
  del subsistema Interview v2 y las nuevas reglas de arquitectura v1.
- Esta revisión **no incluye código**: es la base obligatoria antes de iniciar
  la implementación incremental del chat público.

---

## 2026-07-30 — Navegación de código en `.ai/`

- Se agregó a `MODULOS.md` una guía de navegación rápida con puntos de entrada,
  funciones relevantes y recorridos para chat web, Interview, WhatsApp, tools,
  panel admin, servicios de negocio y rutas HTTP.
- El objetivo es que una persona o IA nueva pueda ubicar el primer archivo y la
  dirección correcta de un cambio sin recorrer todo el repositorio.

## 2026-07-30 — Autenticación del panel admin

- Se reemplazó la configuración de ejemplo de Supabase en `admin/js/auth.js` por
  la instancia real del proyecto y su clave pública `anon`.
- El inicio de sesión del panel conserva una interfaz de solo contraseña; el
  correo administrador se define internamente para completar el flujo de
  autenticación de Supabase.
- El correo interno de autenticación se ajustó a `admin@tecnosanjuan.com`, que
  corresponde al usuario administrador existente en Supabase Auth.
- **Fix Crítico de Autorización JWT**: Se restauró la validación del JWT de
  acceso (User Token) utilizando `JWKS` (`createRemoteJWKSet`), para soportar el
  algoritmo **ES256/RS256** configurado en la instancia de Supabase. Se removió
  la validación estricta de la cadena del `issuer` que causaba falsos positivos
  de error 401.
- Se implementó un saneamiento riguroso en el middleware de autorización
  (`middleware/auth.js`) para ignorar espacios, comillas accidentales y
  diferencias de mayúsculas/minúsculas entre el email extraído del JWT y la
  variable de entorno `ADMIN_ALLOWED_EMAILS`. Además, se agregó reporte
  detallado en el error 403.

## 2026-07-30 — Fix de Comportamiento Conversacional y Memoria (Interview vs Chat)

- **Motivo del cambio**: Consultas informativas simples (ej. "¿cuánto cuesta un mouse?")
  estaban disparando falsos positivos en el `InterviewRouter`, iniciando flujos
  de recolección de datos (pedir nombre/teléfono) que resultaban en solicitudes
  de presupuesto vacías. Adicionalmente, el motor de IA principal (`PlanningEngine`)
  sufría pérdida de contexto (amnesia) tras terminar un flujo o recibir mensajes
  cortos (ej. "¿qué?"), debido a que el historial de conversación no se estaba
  inyectando en su prompt.
- **Archivos Modificados**: 
  - `backend/worker/src/services/nexus/interview-router.js`
  - `backend/worker/src/services/nexus/planning-engine.js`
- **Decisión y Comportamiento Esperado**: 
  1. Se ajustaron las expresiones regulares en `interview-router.js` (`budget-request`, 
     `repair-request`, `print-order`) para requerir intenciones claras mediante verbos 
     de acción (ej. "necesito reparar", "se me rompió", "cotización para arreglar"). 
     Consultas de precios o información genérica ya no inician el `Interview` y
     pasan directamente al LLM para una respuesta conversacional.
  2. Se expuso el `conversationHistory` en la plantilla base del `PlanningEngine`.
     El LLM ahora tiene acceso a toda la ventana de contexto de la sesión, permitiendo
     mantener conversaciones naturales coherentes después de flujos interrumpidos
     o consultas cortas.
- **Nueva regla de arquitectura**: El `InterviewRouter` debe utilizar validaciones
  estrictas (High Precision) en vez de coincidencia difusa (High Recall). Es preferible
  que la IA atienda una solicitud vagamente formulada de forma conversacional hasta
  que el usuario exprese una intención clara, antes que disparar un flujo estructurado
  por error.

## 2026-07-28 — Cambios de código

- `fix(interview)`: se resolvió el flujo de entrevista en producción y se previno
  la filtración de texto de planificación (planning text leakage) hacia el usuario.

## 2026-07-28 — Cambios de documentación `.ai/`

- Se actualizó la memoria estructurada `.ai/` (README, DECISIONES, MODULOS, REGLAS,
  CAMBIOS) para reflejar el estado real del proyecto.
- Se documentó el estado real del backend: arquitectura completa de producción con
  engine de IA (`NexusAIEngine`), sistema de tool calls, `PlanningEngine`,
  `ProfileManager`, `ChatRuntime`, `ContextManager`, `ConversationManager`.
- Se documentó la integración bidireccional con WhatsApp via Meta Cloud API.
- Se documentó el subsistema Interview como completamente implementado (versión
  actual en `services/interview/v2/`).
- Se documentaron las tablas de Supabase realmente existentes con migrations.
- Se documentó el sistema de eventos asíncronos (EventBus, EventQueue, DLQ) y
  el sistema de notificaciones.
- Se registró la existencia de 1369+ tests en Vitest cubriendo todos los módulos.

---

## 2026-07-27

- `feat(interview)`: integración del motor Interview con el handler de chat,
  WhatsApp y la API. El motor de entrevistas quedó completamente conectado al
  flujo de producción.
- Se creó la tabla `interview_sessions` en Supabase con sus índices.
- `fix(schema-registry)`: los schemas de servicios se cambiaron a imports ES
  estáticos para compatibilidad con Cloudflare Workers (no permite imports
  dinámicos de archivos en producción).
- `wrangler.toml`: se agregaron `compatibility_flags` para compatibilidad con
  Node.js; se limpiaron triggers redundantes; se actualizaron `kv_namespaces`
  y variables de entorno.
- **Release Candidate** del stack Nexus AI Platform (commit: 2026-07-27T02:32).

---

## 2026-07-25

- Cleanup: se eliminó código muerto (simple-query, exports sin uso).
- **Eliminación y reconstrucción del sistema de entrevistas**: el sistema anterior
  fue eliminado completamente y reemplazado por el subsistema Interview actual
  (directorio `services/interview/v2/`).
- Extracción múltiple de entidades + schemas en `.js` + migración a Wrangler 4.
- Refactorización interna del motor Interview: separación limpia entre el motor de
  recolección de datos y la capa de IA conversacional.
- Migración completa: se eliminó la ruta antigua de `chat.js`, se implementó
  prefill de datos, se agregaron tests de integración.
- Se detectó y corrigió bug de consistencia eventual en KV: se dio prioridad al
  estado de entrevista del cliente sobre el KV store (las sesiones de Cloudflare
  KV tienen eventual consistency).
- Se agregó logging `[STATE_TRACE]` para debugging de estado en producción.
- Se agregó campo `engineVersion` al estado para detectar sesiones legacy de KV.
- `chat.js`: se implementó rate limiting por IP y detección de spam.
- Se agregaron campos `phone`/`website` al módulo de business-info en el admin.
- CI/CD: se fijó el workflow de deploy con Node 22 + Wrangler directo.

---

## 2026-07-24

- Se implementó el sistema de admin con gestión de conversaciones, asignación de
  admins, vista de historial y búsqueda.
- Se agregó soporte de KV namespace de Cloudflare para persistencia de sesiones
  de entrevista (alternativa a Supabase para sesiones de corta duración).
- El chatbot web ya usa `data.summary` para mostrar el resumen al usuario al
  completar la entrevista, con fallback a `data.response`.

---

## Línea de tiempo del proyecto (reconstruida de commits)

Esta sección registra los hitos arquitectónicos mayores en orden cronológico.
Fuente: historial de commits del repositorio GitHub.

| Fecha | Evento |
|---|---|
| Antes de 2026-07-24 | Versión original: HTML autocontenido, chat simple de intake de pedidos para negocio de impresión 3D/LED, salida a mensaje de WhatsApp pre-armado, integración directa con API de Anthropic. Sin backend propio ni base de datos. |
| ~2026-07-24 | **Pivot**: el objetivo cambió de administrar pedidos de 3D/LED a administrar automáticamente clientes y trabajo del servicio técnico de celulares (Tecno San Juan). Eso requirió una arquitectura nueva: backend (Worker), base de datos real (Supabase) y motor de IA capaz de razonar sobre múltiples entidades. |
| ~2026-07-24 | Integración de WhatsApp via Meta Cloud API (rate limiting, spam detection) |
| ~2026-07-24–25 | Primera versión del sistema de entrevistas (luego eliminada y reconstruida) |
| 2026-07-25 | Eliminación del sistema de entrevistas antiguo; reconstrucción como Interview v2 |
| 2026-07-25 | Refactorización interna del motor Interview: separación motor puro / IA conversacional |
| 2026-07-25 | Migración a Wrangler 4; fix de eventual consistency en KV sessions |
| 2026-07-27 | Release Candidate: stack completo Nexus AI Platform |
| 2026-07-27 | Fix schema-registry: static imports para Cloudflare Workers |
| 2026-07-27 | Creación de tabla `interview_sessions` en Supabase |
| 2026-07-27 | feat: Interview integrado con chat + WhatsApp + API |
| 2026-07-28 | fix: flujo de entrevista en producción + prevención de text leakage |
| 2026-07-28 | Primera versión de la memoria estructurada `.ai/` |

---

## Notas técnicas importantes extraídas de la historia

- **KV vs Supabase para sesiones**: Cloudflare KV tiene eventual consistency. Se
  resolvió dando siempre prioridad al estado de la sesión del cliente en memoria
  sobre el KV store. Las sesiones de entrevista de larga duración se persisten en
  Supabase (`interview_sessions`).
- **Schema-registry**: los schemas de servicios de Interview deben ser ES imports
  estáticos (no `import()` dinámicos) por restricciones de Cloudflare Workers.
- **Text leakage**: el `PlanningEngine` genera texto interno de planificación que
  NO debe llegar al usuario. Hay una capa explícita que filtra/formatea la respuesta
  antes de enviarla. No modificar este filtro sin entender la implicancia.
- **Interview: una sola versión activa**. El directorio `services/interview/v2/`
  contiene el subsistema de entrevistas actual. No existe versión v3: hubo una
  refactorización interna del mismo motor (separación de responsabilidades) que
  el equipo referenció informalmente, pero el código sigue en `v2/`. Si se crea una
  versión nueva del subsistema, se creará un directorio `v3/`; hasta entonces,
  toda referencia a Interview apunta a `services/interview/v2/`.
