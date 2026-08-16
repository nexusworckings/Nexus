# INFORME DE AUDITORÍA POST-P9 — Cierre técnico y estado real

Fecha: 2026-08-12
Alcance: verificación del estado real del repositorio tras P9, registro de
hallazgos, diseño de arquitectura para el hallazgo crítico. **Sin cambios de
código** en esta sesión.
Baseline verificado: **102 archivos de test / 1874 tests pasan** (Node 22.23.2,
Vitest) — corresponde al baseline documentado del cierre de P9.

Método aplicado según `REGLAS.md`: se leyó todo `.ai/`, se comparó cada
afirmación contra el código real (`backend/worker/src/`) y las rutas HTTP reales
(`router.js`), y las discrepancias documentadas se corrigen en esta pasada.

---

## 1. Hallazgo crítico — WhatsApp multi-turn interview persistence 🔴

### Clasificación
**CRÍTICO — pérdida de estado conversacional en WhatsApp.** Una entrevista
iniciada por WhatsApp nunca avanza más allá de la primera pregunta: la segunda
respuesta del usuario no se enruta al `InterviewController` y cae al flujo del
engine general. La sesión de entrevista creada en Supabase queda huérfana
(sin responder ni borrarse), y la persistencia de P9
(`ChatRuntime.#persistInterviewEntities`) jamás se ejecuta en este canal.

### Cadena de evidencia (verificada en el código)

1. `webhook-handler.js:172-177` — `#processMessage` llama a
   `this.#runtime.handleMessage({ message, sessionId: conversation.conversationId, clientId, conversationId })`.
   **No pasa `interviewSessionId`.**
2. `whatsapp-webhook.js:135` — el runtime del canal es un `ChatRuntime` con su
   propio engine y su propio `InterviewRouter` (instancia aparte del web).
3. `interview-controller.js:256-262` — al iniciar, `StateKeeper.create(...)`
   genera un **UUID nuevo** (`state-keeper.js:19`, `generateId()`) y ese UUID es
   el `sessionId` de la entrevista guardada en Supabase.
4. `webhook-handler.js:179-188` — la respuesta del runtime se envía leyendo solo
   `response.message || response.question`. **`response.sessionId` se descarta**;
   nadie lo persiste para el siguiente mensaje.
5. Turno siguiente: el webhook vuelve a llamar con `sessionId = conversation.conversationId`
   y **sin** `interviewSessionId`.
6. `chat-runtime.js:41` — `const activeInterviewId = interviewSessionId || sessionId`,
   por lo que en WhatsApp `activeInterviewId = conversation.conversationId`.
7. `chat-runtime.js:43` — `hasActiveInterview(conversationId)` →
   `interviewRouter.hasActiveInterview` (interview-router.js:168) →
   `interviewController.hasSession(conversationId)`
   (interview-controller.js:531) → `sessionStore.exists(conversationId)`
   → **false** (la sesión existe bajo el UUID, no bajo el conversationId).
8. `chat-runtime.js:46-55` — el `answerMessage` no se alcanza; el mensaje
   clasifica de nuevo y, si no dispara `action`, pasa al engine
   (`chat-runtime.js:80-92`). La entrevista no continúa.

### Por qué Web Chat sí funciona

- `handlers/chat.js:202` — `const interviewSessionId = body.interview?.sessionId`.
- `handlers/chat.js:214-218` — se reenvía a `runtime.handleMessage`.
- El frontend conserva el vínculo: `js/api.js:16` (`body.interview = interview`)
  y `js/chatbot.js:89-93` (guardan `data.interview` y lo reenvían en cada turno).
- WhatsApp no tiene ese mecanismo: el webhook es stateless y no guarda el vínculo
  conversación ↔ entrevista.

### Impacto

- Las entrevistas multi-turn son **imposibles en el canal principal** (WhatsApp).
- Cada intento de re-inicio crea una nueva sesión UUID huérfana en
  `interview_sessions` (crecimiento sin recolección).
- La inyección de entidades post-entrevista de P9
  (`#persistInterviewEntities`) depende de `interviewComplete === true`, que no
  ocurre en WhatsApp: device/service/product/problem tampoco alimentan el
  Conversation Context en ese canal.
- No existe test que lo cubra: `whatsapp-integration.test.js` mockea el runtime
  con una respuesta `{ type: 'chat', message }` (líneas 83-103) y no ejerce el
  camino de entrevista.

---

## 2. Divergencias adicionales encontradas (registro para decidir)

### 2.1 Wiring de tools — web vs WhatsApp
- `handlers/chat.js:466-510` registra: interview tools
  (`questionGenerator`/`interpreter`/`interviewController`) + 4 tools comerciales
  (`searchPrice`, `searchBusinessInfo`, `searchProduct`, `searchStock`).
- `handlers/whatsapp-webhook.js:70-74,123-137` registra **todas** las tools de
  `tools/index.js` (`registerTools`) + `registerConversationTools` +
  `registerWhatsAppRealTools` + interview tools.
- Resultado real: en WhatsApp el Planner ve `searchClient`, `searchRepair`,
  `searchBudget`, `searchPrintOrder`, `getConversation`, `searchNotifications`;
  en Web Chat no están registradas (un plan que las emita → `TOOL_NOT_FOUND`).
- Ya reportado en P7 (CAMBIOS.md) como hallazgo no corregido de wiring
  (afecta capacidades, no seguridad: el `#getAllowedTools` del planner filtra por
  registry; el executor devuelve `NOT_ALLOWED`/`TOOL_NOT_FOUND` si sale).

### 2.2 Persona / system prompt — web vs WhatsApp
- Web: `handlers/chat.js` construye el prompt del respondFn/planner vía
  `context.js#buildMessages`/`getSystemPrompt` → `DEFAULT_SYSTEM_PROMPT`
  (español argentino, `context.js:4`) + policy de `chatbot_config`.
- WhatsApp: `whatsapp-webhook.js:99-111` usa
  `composePlannerContext(businessPolicy.policy, profileManager.get("customer")?.systemPrompt)`
  → la persona de `profile-manager.js:12-13` (**inglés**: "You are Nexus, a
  helpful assistant for Tecno San Juan…") + policy.
- Divergencia de tono/idioma de la persona entre canales y de la fuente del
  prompt del planner. Sin impacto de seguridad; pendiente de decisión de
  producto (persona canónica).

### 2.3 Context manager / sesiones
- El webhook construye su propio engine sin pasar `contextManager`
  (`whatsapp-webhook.js:44` declara `const contextManager = null;` y no lo
  inyecta; el engine crea uno propio) → `ChatRuntime.#hasInterviewSession`
  (chat-runtime.js:95-99) enruta a perfil `interview` solo si la sesión
  conversacional se creó explícitamente con ese perfil, que no ocurre por
  webhook. Secundario frente al hallazgo 1; documentado para el diseño.

---

## 3. Diseño de arquitectura — vínculo conversación ↔ entrevista en WhatsApp

### Contexto de decisión
La regla de `REGLAS.md` ("Sesiones de entrevista") define dos identificadores
separados: **session** = conversación (legacy, memoria/KV) y **interview** =
entrevista v2 (UUID de `StateKeeper`, persistido en Supabase). P9 ya estableció
que la fuente de verdad de entrevistas es Supabase. El problema no es dónde vive
el estado de la entrevista (Supabase), sino **quién recuerda el vínculo
conversación → interviewActiva** cuando no hay cliente frontend.

### Alternativa A — Guardar `interviewSessionId` en `ConversationMemory`
```text
conversationId
    ↓ remember/recall
ConversationMemory
    └── interviewSessionId   (TTL + forget al completar)
```
- Entrada: tras `type === "interview"`, el webhook hace
  `conversationMemory.remember(conversationId, "interviewSessionId", response.sessionId, ttl)`.
- Siguiente turno: `conversationMemory.recall(...)` y se pasa como
  `interviewSessionId` a `runtime.handleMessage` (se suma a `webhook-handler.js`).
- Salida: tras `type === "completed"` → `forget`; si se cancela o expira el TTL,
  el `hasSession(UUID)` devuelve false naturalmente.
- **Pros:** cambio mínimo y localizado en `webhook-handler.js` (usa la API
  pública `remember`/`recall` de `ConversationMemory`, ya conectada al webhook);
  consistente con cómo ya se guardan `phone`/`clientId`/`clientName`; no toca
  `InterviewController` ni `StateKeeper`; reproduce el patrón web.
- **Contras:** la memoria es en proceso (se pierde con el reinicio del Worker /
  sería de corto plazo); requiere TTL y limpiar en completitud; no es la "fuente
  de verdad" ideal (la entrevista vive en Supabase, el vínculo en memoria).

### Alternativa B — Vínculo en la entidad de conversación
- Agregar `interviewSessionId` a la entidad de conversación
  (`ConversationSession`/`ConversationManager`) y actualizarlo en el webhook.
- **Pros:** un solo objeto de estado por conversación; visible/auditable;
  sobrevive al ciclo del webhook mientras la conversación exista.
- **Contras:** `ConversationManager` también es in-memory (mismo límite que A);
  toca el modelo de conversación (mayor superficie); duplica estado si además
  queda en memoria.

### Alternativa C — Enlace por `conversationId` en Supabase (arquitectura a largo plazo)
- Pasar el `conversationId` al iniciar la entrevista y persistirlo (p. ej. en
  `state.metadata`/`interview_sessions`), y resolver la entrevista activa de una
  conversación consultando Supabase por `(conversationId, status='active')`,
  en lugar de depender de memoria.
- **Pros:** alinea con `REGLAS.md` (Supabase = fuente de verdad de entrevistas);
  sobrevive reinicios/aislados de Cloudflare; elimina la dependencia de memoria
  de corto plazo; uniforme para web y WhatsApp y futuros canales sin cliente.
- **Contras:** modifica el contrato de `InterviewController`/`StateKeeper`
  (storage de conversationId) y agrega una consulta por conversationId; mayor
  alcance; requiere decidir política de sesiones múltiples por conversación.

### Recomendación (decisión propuesta, NO implementada)
1. **Corto plazo (fix correctivo): Alternativa A**, usando la API pública de
   `ConversationMemory` desde `webhook-handler.js` (mínimo, reversible,
   reproducir el patrón web). Requiere: persistir `interviewSessionId` en
   `remember`, reenviarlo como `interviewSessionId` en `handleMessage`, `forget`
   al completar, y un test de integración del webhook que ejerza el ciclo
   completo start → answer → complete.
2. **Mediano plazo (arquitectura): Alternativa C**, evaluada como fase de
   refactor si se confirma que WhatsApp es el canal premium (lo es por
   DECISIONES.md). Resuelve también la divergencia de persona (2.2) y de
   sesiones (2.3) de forma uniforme.
3. La **Alternativa B** queda descartada frente a A en costo/beneficio: mismo
   límite de memoria, más superficie de cambio.

**Ficheros que quedan marcados para el fix (pendientes de aprobación):**
`webhook-handler.js` (único cambio de código del fix A) y su test
`whatsapp-integration.test.js`. NO se tocan en esta sesión.

---

## 4. Correcciones de memoria aplicadas en esta sesión

Verificadas contra el código real y aplicadas en `.ai/`:

- `.ai/README.md` (flujo B): el webhook NO pasa por `handlers/chat.js`; el
  router (`router.js:87-95`) despacha `/whatsapp/webhook` a
  `handlers/whatsapp-webhook.js`, que construye su propio engine + `ChatRuntime`
  (instancias aparte). Corregido.
- `.ai/MODULOS.md`: fila de módulo Chat (WhatsApp), recorrido "Mensaje entrante
  por WhatsApp" y fila de navegación "La entrada, seguridad y respuesta de
  WhatsApp" señalaban `handlers/chat.js`. Corregido a
  `handlers/whatsapp-webhook.js`.
- `.ai/REGLAS.md`: se agrega nota en la sección WhatsApp indicando que el
  vínculo conversación↔entrevista no se persiste (hallazgo crítico) y que el fix
  está en diseño; `webhook-handler.js`, `chat-runtime.js`, `InterviewController`,
  `StateKeeper` y `ConversationMemory` no deben modificarse hasta resolverse la
  arquitectura.
- `.ai/DECISIONES.md`: entrada pendiente con el análisis de A/B/C y la
  recomendación (A a corto, C a mediano), marcada explícitamente como "en
  análisis / no implementada".
- `.ai/CAMBIOS.md`: entrada de cierre de auditoría (esta sesión) sin cambios de
  código, preservando la historia existente.

---

## 5. Pendientes deliberados (no mezclados)

- `impresion_3d` en `INTENT_SCHEMA_MAP` vs `print-order` (pre-existente,
  documentado en CAMBIOS.md P1/P8/P9). No tocado.
- Persona canónica web vs WhatsApp (sección 2.2). Decisión de producto.
- Equiparación del registro de tools entre canales (sección 2.1).
- La deuda de formato de `npm run format:check` (~169 archivos pre-existentes)
  no fue introducida por esta auditoría.