# MODULOS.md — Nexus

Mapa completo del sistema: módulos de producto e infraestructura, con estado real
y ubicación en el código.

---

## Módulos de producto

| Módulo | Función | Estado | Ubicación principal |
|---|---|---|---|
| Chat (web) | Atención por chat web: FAQ, info del negocio, horarios, entrevistas | ✅ Funcional | `js/chatbot.js` |
| Chat (WhatsApp) | Atención bidireccional por WhatsApp (entrada + salida) | ✅ Funcional | `handlers/whatsapp-webhook.js`, `services/whatsapp/` |
| Interview | Recolecta datos estructurados para reparación, presupuesto e impresión 3D | ✅ Implementado | `services/interview/v2/` |
| Completion Pipeline | Orquesta finalización de entrevistas: validación → cliente → entidad de negocio → eventos | ✅ Implementado | `services/completion/` |
| Admin — Conversaciones | Gestión de conversaciones activas desde el panel interno | 🟡 En construcción | `admin/js/admin.js`, `handlers/admin.js` |
| Admin — Clientes | Gestión de clientes: datos personales, historial | 🟡 En construcción | `admin/js/modules/clients/` |
| Admin — Reparaciones | Ciclo de vida de reparaciones | 🟡 En construcción | `admin/js/modules/repairs/` |
| Admin — Presupuestos | Creación y seguimiento de presupuestos | 🟡 En construcción | `admin/js/modules/budgets/` |
| Admin — Dashboard | Vista general: estadísticas, actividad reciente | 🟡 En construcción | `admin/js/modules/dashboard/` |
| Admin — AI Assistant | Asistente IA para uso interno del admin | 🟡 En construcción | `admin/js/ai-assistant.js`, `services/nexus/admin-assistant.js` |
| Print Orders | Órdenes de impresión 3D (schemas y servicio existen; uso final en revisión) | 🟡 Mantenido | `admin/js/modules/print-orders/`, `services/business/print-service.js` |

---

## Infraestructura del backend (Worker)

### Motor de IA — `services/nexus/`

| Componente | Responsabilidad |
|---|---|
| `chat-runtime.js` | Orquestador principal. Decide: ¿entrevista activa? → `InterviewRouter`; sino → `NexusAIEngine`. Al completar una entrevista (resultado con `interviewComplete`) traduce su resultado a entidades del Conversation Context vía `#persistInterviewEntities` → `interview-context.js` + `ConversationContextOrchestrator.resolveEntities` (P9), para que el turno siguiente conserve device/service/product/problem. |
| `nexus-ai-engine.js` | Motor de IA. Construye prompt, llama LLM, procesa tool calls, retorna resultado. Sin estado propio. |
| `planning-engine.js` | Dado un mensaje y contexto, determina qué acción tomar. No ejecuta, solo planifica. Soporta **planes compuestos**: `createPlan()` emite `{ steps, plan, explanation }` con 0, 1 o N tool calls. Cada step usa el schema `{ id, tool, input, dependsOn, parallel }` para expresar dependencias, paralelismo y orden explícito (formato nuevo); el legacy `plan:[{tool,params}]` sigue aceptado y se normaliza. La sección **"WHEN TO USE EACH TOOL (DISTINCT CONTRACTS)"** guía al LLM con contratos inequívocos (P6): producto (existencia/atributos/precio/stock) → `searchProduct`; stock/unidades restantes → `searchStock`; precio de **servicio** de reparación → `searchPrice` (nunca para precios de producto, que van por `searchProduct`); info del negocio → `searchBusinessInfo`. |
| `tool-registry.js` | Almacena herramientas disponibles `{ name, description, parameters, execute }` |
| `tool-executor.js` | Ejecuta herramientas por nombre con trazabilidad y métricas. `execute()` ejecuta una tool; `executePlan(steps, context, { allowedTools, timeoutMs })` ejecuta un plan resolviendo el **grafo de dependencias** (`dependsOn`), lanza en paralelo los pasos `parallel:true`, serializa los `parallel:false`, espera dependencias, preserva errores parciales (`{ results, errors }`) y devuelve `results` alineados al orden de entrada. Mantiene una **Working Memory** interna (solo durante la llamada) con los resultados exitosos por id de paso y resuelve referencias `$step-id.result.field` en el input de cada tool antes de ejecutarla. **Validación de argumentos (P7):** antes de ejecutar, valida determinísticamente cada `inputSchema` en `#validateParams` (required, tipos `string`/`number`/`boolean`/`object`/`array`/`any`, `enum`, string vacío en required) y devuelve `issues: [{path, code, message}]`. Contrato de resultados con `errorCode`: `SUCCESS` / `EMPTY_RESULT` (`success:true` + `empty:true` si `data.results` es `[]`) / `INVALID_ARGUMENTS` / `TOOL_ERROR` / `TOOL_NOT_FOUND` / `NOT_ALLOWED`. Argumentos desconocidos se ignoran (passthrough); no hay coerción de tipos. |
| `profile-manager.js` | Perfiles `customer`, `admin`, `superadmin` con sus `allowedTools[]` |
| `context-manager.js` | Sesiones de conversación en memoria: historial, clientId, estado de entrevista |
| `conversation-context-orchestrator.js` | **Memoria conversacional de corto plazo** (Phase 6/P8). Almacena entidades por sesión de forma **determinística** (sin LLM), resuelve referencias y arrastra contexto entre mensajes. Entidades (estructura plana): **Identidad** `device`, `brand`, `model`, `clientName`, `repairId`, `budgetId`; **Producto/pedido** `product`, `quantity`, `color`, `material`; **Servicio** `service`, `urgency`, `date`; **Problema** `problem` (P9); **Personalización** `logo`. `device` es el nombre compuesto; `brand`/`model` existen independientemente (ej. "Mi Samsung se cayó" → `brand: "Samsung"`). `problem` y los atributos de pedido (`quantity`, `color`, `material`, `urgency`, `date`, `logo`) viven mientras el tópico (`device`/`product`) no cambie (se resetean en `deviceChanged`/`productChanged`); `problem` NO se extrae del texto libre (solo llega vía `resolveEntities` desde una entrevista completada). Exponer `resolve(message, sessionId)` (extracción + merge) y `resolveEntities(entities, sessionId)` (merge de entidades pre-extraídas, P9) con el mismo ciclo de vida. Vive solo durante la sesión activa (TTL + tope de entradas); expone el singleton `sharedConversationContextOrchestrator`. |
| `business-context.js` | **Fuente canónica del Business/Policy Context y del Conversation Context** (Phase 2/3). Expone `composePlannerContext(policy, persona)` (system prompt del Planner), `buildConversationContextData()` y `serializeConversationContext()` (entidades del turno como JSON estructurado `{ entities, references, state }`) y la regla `CONVERSATION_CONTEXT_RULE`. Consumido por el Planner, el Responder (`context.js#buildMessages`) y el webhook de WhatsApp. |
| `commercial-gate.js` | **Gating determinístico anti-alucinación comercial (P2)**. Puro y sin estado; decide ANTES de que el LLM genere. `evaluateCommercialGate({ userMessage, plan, steps, results })` → `{ status: 'none'\|'allow'\|'block', intent, evidence, fallback, commercialPolicy }`. Fuentes comerciales autorizadas: searchProduct, searchPrice, searchStock, searchBusinessInfo, searchRepair, searchBudget. `searchInternet` y las `entities` del Conversation Context NO son evidencia. `block` devuelve fallback seguro sin llamar al LLM; `allow` inyecta `commercialPolicy` vía `#runResponder` → `context.js#buildMessages`. Consumido por `chat.js` y `whatsapp-webhook.js`. |
| `reference-resolver.js` | **Resolvedor de referencias del kernel** (Phase 7). Determinístico y sin `eval`: navega `Working Memory` (mapa de resultados exitosos por id de paso) resolviendo referencias `$step-id.result.field` (anidado, arrays con `.0` o `[0]`, múltiples, inexistentes y circulares con error controlado). No vuelve a interpretar cadenas dentro de datos ya resueltos. |
| `conversation-manager.js` | CRUD de conversaciones: crear, buscar, filtrar, asignar, estadísticas |
| `conversation-memory.js` | Memoria clave-valor por conversación con TTL (max 10k entries, prune cada 60s). Guarda `phone`, `clientId`, `clientName` y el vínculo `interviewSessionId` ↔ `conversationId` (P10) |
| `conversation-session.js` | Modelo de datos de una conversación: id, cliente, canal, estado, historial |
| `observability.js` | Métricas: latencia, tools ejecutadas, errores, mensajes procesados |
| `admin-assistant.js` | Variante del engine para uso interno del panel admin |
| `interview-router.js` | Puente entre Nexus e Interview. **Determinístico (sin LLM).** `classify(message)` detecta intención de acción SOLO con evidencia lingüística de solicitud explícita (primera persona, imperativos, "me pueden/podés", "llevar a reparar"); las descripciones de problema, preguntas hipotéticas (`HYPOTHETICAL_QUESTION_PATTERNS`) y preguntas de capacidad ("¿hacen X?") NO inician entrevista. `CONSULTATION_PATTERNS` + campo `query` actúan como gate antijacking (consulta comercial → no entrevista). `startInterview()` propaga `question`, `interviewComplete` y `summary` desde `InterviewController`. |
| `interview-context.js` | **Puente entrevista → Conversation Context (P9)**. Puro y sin estado: `mapInterviewEntitiesToContext({ schemaId, completedFields })` traduce el resultado estructurado de una entrevista completada (v2) a entidades P8 (`device`, `problem`, `service`, `product`, `quantity`, `color`, `material`, `urgency`, `clientName`) por schema (`repair-request`, `budget-request`, `print-order`, `impresion_3d`). Consumido por `ChatRuntime.#persistInterviewEntities`. |
| `client-resolver.js` | Resuelve cliente (nombre + teléfono) a registro en `clients` |
| `interview/completion-handler.js` | Crea registro de negocio (`repair`/`budget`/`print-order`) y cliente al completar entrevista |

### Tools del motor — `services/nexus/tools/`

| Tool | Propósito |
|---|---|
| `conversation-tools.js` | Buscar, crear, actualizar conversaciones |
| `admin-tools.js` | Asignar admin, enviar respuestas, obtener estadísticas |
| `interview-tools.js` | Iniciar, avanzar, completar entrevistas |

### Interview — `services/interview/v2/`

Pipeline de recolección de datos estructurada. Ver `SCHEMA_SPECIFICATION.md` en esa
carpeta para el detalle del schema de servicios.

| Componente | Responsabilidad |
|---|---|
| `interview-controller.js` | Orquesta el pipeline: pregunta → interpreta → resuelve → avanza; `start(schema, message)` aplica campos válidos del primer mensaje |
| `flow-evaluator.js` | Determina siguiente campo, completitud y deadlocks según schema y estado |
| `question-generator.js` | Genera la pregunta a mostrar según el campo pendiente |
| `interpreter.js` | Único módulo de v2 que llama a OpenRouter. Extrae entidades del mensaje. |
| `inference-engine.js` | Aplica reglas de inferencia declarativas del schema |
| `condition-evaluator.js` | Evalúa condiciones `skipIf` y `dependsOn` |
| `state-keeper.js` | Estado inmutable de la entrevista con historial |
| `schema-registry.js` | Carga, valida y cachea schemas JSON |
| `schema-index.js` | Mapa de schemas integrados (imports ES estáticos) |
| `stores/supabase-session-store.js` | Persistencia de sesiones en Supabase (`interview_sessions`); `get()` expone `status`, `markCompleted()` lo pasa a `'completed'` |
| `stores/memory-session-store.js` | Persistencia en memoria para tests |
| `session-store.js` | Clase base abstracta de los stores |
| `ai-adapter.js` | Adaptador hacia OpenRouter para el Interpreter y QuestionGenerator |
| `constants.js`, `errors.js`, `utils.js` | Constantes, errores y helpers |

**Pipeline:**
```text
1. ¿Nuevo? → pregunta inicial (welcome + primera pregunta)
2. Interpretar → AI extrae entidades del mensaje del usuario
3. Validar → valida contra schema del servicio
4. Inferir → aplica reglas declarativas del schema
5. Avanzar → FlowEvaluator determina siguiente campo
6. ¿Completo? → generar resumen + structuredSummary
```

### Completion Pipeline — `services/completion/`

Módulo de dominio que orquesta el cierre de una entrevista completada.

| Componente | Responsabilidad |
|---|---|
| `completion-pipeline.js` | Punto único: validar → resolver cliente → insertar entidad → actualizar sesión → emitir evento |
| `validation/` *(planificado)* | Validar campos críticos del negocio antes de insertar |
| `client-resolver.js` *(planificado)* | Upsert de cliente por teléfono (delega en `services/business/client-service.js`) |
| `entity-handler.js` *(planificado)* | Delega en `CompletionHandler` para insertar repair/budget/print-order |
| `event-emitter.js` *(planificado)* | Emite eventos al bus/queue existente |

**Nota:** `CompletionHandler` (`services/nexus/interview/completion-handler.js`) está testeado y envuelto por `CompletionPipeline`. El pipeline (valida completitud con `FlowEvaluator`, resuelve cliente vía `ClientResolver`, delega la creación al `CompletionHandler`, marca `interview_sessions.status='completed'` y encola eventos al `EventQueue`) está **cableado en `handlers/chat.js`**: cuando una entrevista completa, `chat.js` invoca `CompletionPipeline.execute({ sessionId })` antes de responder. La emisión de eventos al `EventQueue` y el resto de canales (WhatsApp, tools/agentes) quedan pendientes.

### WhatsApp — `services/whatsapp/`

| Archivo | Responsabilidad |
|---|---|
| `webhook-handler.js` | Recibe y valida webhooks de Meta. Persiste el vínculo conversación ↔ entrevista (P10): guarda `interviewSessionId` en `ConversationMemory` por `conversationId` (`recall` antes de `handleMessage`, `remember` al recibir `type:'interview'` con `sessionId`, `forget` al recibir `type:'completed'`/`'chat'`), para que las entrevistas multi-turn de WhatsApp continúen entre mensajes. |
| `webhook-validator.js` | Verifica firma HMAC del webhook |
| `message-parser.js` | Parsea el payload de Meta a estructura interna |
| `meta-whatsapp-channel.js` | Envía mensajes via Meta Cloud API |
| `whatsapp-service.js` | Orquestador del canal: entrada + salida |
| `contact-resolver.js` | Resuelve contacto de WhatsApp → cliente en Supabase |
| `media-handler.js` | Manejo de mensajes con media (imágenes, audio) |
| `whatsapp-real-tools.js` | Tools del engine específicas para el canal WhatsApp |

### Business — `services/business/`

| Servicio | Responsabilidad |
|---|---|
| `client-service.js` | CRUD de clientes en Supabase |
| `repair-service.js` | CRUD de reparaciones en Supabase |
| `budget-service.js` | CRUD de presupuestos en Supabase |
| `print-service.js` | CRUD de órdenes de impresión en Supabase |
| `product-service.js` | **Catálogo de productos (Phase 8, scoring de color/material Phase 12/P3).** `search(query)` → `{ results: [{ id, name, brand, category, price, currency, stock, available }] }`. Matching determinístico: mayúsculas/acentos, plural/singular, tokenización (filtra dígitos puros para que cantidades no rompan el matching), stopwords y coincidencia parcial. Ordena por relevancia ponderada **identidad > atributo**: nombre `+4` > marca `+3` > categoría `+2` > parcial `+1`; color/material **pedido y presente** suma `+2`/`+3`; atributo pedido con **otro valor declarado** penaliza (conflicto relega, no excluye): `-1` color, `-5` material; atributo pedido **sin evidencia** → producto excluido (no se inventa). Los colores/materiales se detectan vía `COLOR_TOKENS`/`MATERIAL_TOKENS` sobre el texto libre del `name` (el catálogo no tiene columnas dedicadas). El **alias semántico se delega al `BusinessKnowledgeGraph`** (`expandTokens`); el matching se queda en el servicio. Servicio puro de dominio; nunca devuelve texto para el usuario. |
| `product-repository.js` | **Interfaz desacoplada** del catálogo. `findAll()` consulta la tabla `products` (`select: id,name,brand,category,price,currency,stock,is_active`, `eq: { is_active: 'true' }`). **Punto de integración:** la tabla `products` aún no existe en el esquema; cuando se cree debe respetar esos nombres de columna. `StockService`/`InventoryService` reutilizarán este mismo modelo sin duplicar estructuras. |
| `stock-service.js` | **Stock/disponibilidad de productos (Phase 11).** `search(query)` → `{ results: [{ id, product, stock, available }] }`. Matching determinístico sobre el nombre del producto (mayúsculas/acentos, plural/singular, tokenización, stopwords, coincidencia parcial), ordenado por relevancia (exacto > parcial). Excluye inactivos; stock `0` → `available: false` pero sigue en los resultados. El **alias semántico se delega al `BusinessKnowledgeGraph`** (`expandTokens`); sin grafo cae a tokens sin expandir. Solo datos estructurados, nunca texto para el usuario. |
| `stock-repository.js` | **Punto de integración** de stock (Phase 11). `findAll()` consulta la tabla `products` con campos mínimos (`select: id,name,stock,is_active`, `eq: { is_active: 'true' }`); tolera tabla inexistente y errores de consulta devolviendo `[]`. |
| `price-service.js` | **Precios de reparación (Phase 10).** `search(query)` → array de `{ service, label, amount, currency }` (mejor puntaje; nunca inventa). Sin tabla de alias propia: resuelve dispositivos/marcas/servicios con `BusinessKnowledgeGraph.resolve(query)` y re-expande tokens con `expandTokens`; si no hay grafo, cae a matching estricto de tokens. |
| `business-info-service.js` | **Info del negocio (Phase 10).** `search(query)` → `{ topic, value }` clasificando por `TOPIC_KEYWORDS`. El tema `brands` delega la resolución de marcas al `BusinessKnowledgeGraph` (si hay grafo y resuelve marcas); si no, vuelve a las FAQs. El resto de temas usa sus tablas/FAQs igual que antes. |
| `business-knowledge-graph.js` | **Business Knowledge Graph (Phase 9/10).** Capa de conocimiento compartido del dominio. No es IA ni vectorial: es un grafo determinístico de entidades (`device`, `brand`, `service`, `product`, `category`) y relaciones explícitas (`supports`, `has_brand`, `belongs_to`, `compatible_with`). API: `resolve(query)` → `{ entities, relations }` (vecindario de 1 salto), `resolveEntities(query)` → entidades que matchean directo (sin expandir vecindario), `expand(entity)` → vecindario de 1 salto de una entidad, `expandTokens(tokens)` → expansión de alias del mapa compartido (única fuente de alias). Construido desde las fuentes existentes: tabla `services` + `prices` + `products` (punto de integración tolerado). No implementa inferencias. En **Phase 10** es el resolutor común inyectado por DI en `PriceService`, `ProductService` y `BusinessInfoService`. |

### Eventos — `services/events/`

| Archivo | Responsabilidad |
|---|---|
| `event-bus.js` | Bus central de eventos pub/sub |
| `event-queue.js` | Cola persistente de eventos con procesamiento asíncrono |
| `event-repository.js` | Persistencia de eventos en Supabase |
| `event-worker.js` | Worker que procesa la cola de eventos |
| `event-dispatcher.js` | Despacha eventos a los handlers registrados |
| `event-types.js` | Tipos de eventos del sistema |
| DLQ (`create_event_dlq.sql`) | Dead Letter Queue para eventos fallidos |

### Notificaciones — `services/notifications/`

| Archivo | Responsabilidad |
|---|---|
| `notification-service.js` | Orquestador de notificaciones |
| `notification-template.js` | Templates para diferentes tipos de notificación |
| `channels/` | Canales de entrega (WhatsApp, email, etc.) |

### Handlers — `handlers/`

| Handler | Responsabilidad |
|---|---|
| `chat.js` | Entrada principal de mensajes. Rate limiting, spam detection, pipeline de mensaje. |
| `admin.js` | Panel admin: auth JWT, CRUD conversaciones, asignación, estadísticas |
| `admin-ai.js` | Endpoint de IA para el admin panel |
| `public.js` | Endpoints públicos (info del negocio, horarios) |
| `whatsapp-webhook.js` | Handler dedicado del webhook de WhatsApp |

---

## Guía de navegación rápida

Usar esta sección para llegar al primer punto de código cuando se conoce el cambio
que se quiere hacer, pero no el módulo. Las rutas son relativas a
`backend/worker/src/`, salvo que indiquen lo contrario.

| Quiero cambiar o investigar… | Empezar por | Punto de interés | Seguir hacia |
|---|---|---|---|
| El mensaje que se muestra en el chat web durante una entrevista | `../../../js/chatbot.js` | Bloque que procesa `data.interview`; muestra `data.response` con `addMessage()` y actualiza el progreso | `../../../js/api.js` → `handlers/chat.js` |
| El estado de entrevista que devuelve el backend al navegador | `handlers/chat.js` | Construcción de `responseData.interview` después de `runtime.handleMessage()` | `services/nexus/chat-runtime.js` |
| Cuándo un mensaje inicia una entrevista (clasificación consulta vs acción) | `services/nexus/interview-router.js` | `classify()` y `selectSchema()` | `services/nexus/chat-runtime.js` → `services/nexus/tools/interview-tools.js` |
| Cómo responde el chat a consultas de horarios / dirección / info del negocio | `services/business/business-info-service.js` | `search()` | `services/nexus/tools/index.js` → tool `searchBusinessInfo` (perfil `customer`) |
| Cómo responde el chat a consultas de precios | `services/business/price-service.js` | `search()` (delega resolución de entidades al `BusinessKnowledgeGraph`) | `services/business/business-knowledge-graph.js` → tool `searchPrice` (perfil `customer`) → **solo precios de SERVICIO de reparación** (tablas `prices`+`services`; NO productos) |
| Cómo responde el chat a consultas del catálogo de productos | `services/business/product-service.js` | `search()` (alias vía `BusinessKnowledgeGraph.expandTokens`) | `services/business/product-repository.js` → tool `searchProduct` (perfil `customer`) → tabla `products` (punto de integración). Devuelve existencia + atributos + **precio de producto** + stock |
| Cómo responde el chat a consultas de stock/disponibilidad | `services/business/stock-service.js` | `search()` (alias vía `BusinessKnowledgeGraph.expandTokens`) | `services/business/stock-repository.js` → tool `searchStock` (perfil `customer`) → tabla `products` (punto de integración). Solo stock/unidades restantes; nunca precio |
| El conocimiento compartido del dominio (entidades + relaciones) | `services/business/business-knowledge-graph.js` | `resolve(query)` → `{ entities, relations }`; `resolveEntities(query)`; `expand(entity)`; `expandTokens(tokens)` | fuentes: `services`/`prices` (activas) + `products` (punto de integración) → consumidores: `PriceService`, `ProductService`, `BusinessInfoService` → tests `business-knowledge-graph.test.js` |
| El inicio de una entrevista y su primera pregunta | `services/nexus/interview-router.js` | `startInterview(schemaId, message)` | `services/interview/v2/interview-controller.js` → `start(schema, message)` |
| Cómo se interpreta, valida y avanza una respuesta de entrevista | `services/interview/v2/interview-controller.js` | `answerMessage()` y el resultado con `question`, `interviewComplete`, `summary` | `interpreter.js` → `flow-evaluator.js` → `question-generator.js` |
| Los campos, validaciones y resumen de una reparación | `services/interview/v2/schemas/repair-request.json` | `fields`, reglas de validación y `whatsappTemplate` | `schema-registry.js` → `interview-controller.js` |
| La entrada, seguridad y respuesta de WhatsApp | `handlers/whatsapp-webhook.js` | `getService()` compone engine + `ChatRuntime` + `WhatsAppService` (instancia propia del canal, no `chat.js`); webhook handler valida firma y delega en `ChatRuntime` | `services/whatsapp/webhook-handler.js` → `services/nexus/chat-runtime.js` |
| La validación del webhook de Meta | `services/whatsapp/webhook-validator.js` | Verificación de firma HMAC | `services/whatsapp/webhook-handler.js` |
| El razonamiento de Nexus y la ejecución de herramientas | `services/nexus/nexus-ai-engine.js` | `process()` | `planning-engine.js` → `tool-executor.js` → `tools/` |
| Cómo Nexus decide entre una o varias herramientas (planes compuestos) | `services/nexus/planning-engine.js` | `createPlan()` → `{ steps, plan, explanation }` | `services/nexus/tool-executor.js` → `executePlan()` |
| Contrato y aislamiento de errores al ejecutar un plan de tools | `services/nexus/tool-executor.js` | `executePlan(steps, context, { allowedTools, timeoutMs })` → `{ results, errors }` | `services/nexus/nexus-ai-engine.js` → respuesta `{ results, errors }` |
| Dependencias, paralelismo y orden explícito de un plan (schema `id`/`dependsOn`/`parallel`) | `services/nexus/tool-executor.js` | `executePlan()` resuelve el grafo de dependencias en oleadas | `planning-engine.js` (prompt + `#normalizeSteps`) → tests `tool-executor.dependency.test.js` |
| Working Memory del kernel + referencias `$step-id.result.field` (Phase 7) | `services/nexus/tool-executor.js` + `reference-resolver.js` | `executePlan()` arma un `Map` de resultados exitosos `{ tool, result }` por id de paso; resuelve referencias en el input antes de ejecutar cada tool | `planning-engine.js` (sintaxis en prompt) → tests `reference-resolver.test.js`, `tool-executor.working-memory.test.js`, `tool-executor.references.integration.test.js` |
| El contexto conversacional de corto plazo (entidades + referencias + arrastre) | `services/nexus/conversation-context-orchestrator.js` | `resolve(message, sessionId)` → `{ context, entities, changed }` | `nexus-ai-engine.js` (mergea `context` en `workingMemory` para el planner) → tools |
| Una nueva tool del motor de IA | `services/nexus/tools/` | Implementación `{ name, description, parameters, execute }` | `tools/index.js` → `profile-manager.js` → test de la tool |
| Reglas de acceso por perfil | `services/nexus/profile-manager.js` | Perfiles y `allowedTools[]` | `tool-executor.js` |
| Clientes, reparaciones o presupuestos en Supabase | `services/business/` | `client-service.js`, `repair-service.js` o `budget-service.js` | `../supabase/migrations/` |
| Una vista o acción del panel administrativo | `../../../admin/js/modules/` | Módulo de UI correspondiente (`clients`, `repairs`, `budgets`, `dashboard`) | `handlers/admin.js` |
| Rutas HTTP expuestas por el Worker | `router.js` | Despacho por path y método | Handler o API del módulo correspondiente |
| Finalización de entrevista → negocio | `services/nexus/interview/completion-handler.js` | `handle()` y los métodos `#processRepair`/`Budget`/`PrintOrder` | `services/business/` + `services/nexus/client-resolver.js` |
| Persistencia de sesiones de entrevista | `services/interview/v2/stores/supabase-session-store.js` | `create()`/`update()`/`get()` | `services/interview/v2/session-store.js` |

---

### Recorridos principales

**Entrevista desde el chat web**

```text
js/chatbot.js
  → js/api.js
  → handlers/chat.js
  → services/nexus/chat-runtime.js
  → services/nexus/interview-router.js
  → services/interview/v2/interview-controller.js
  → services/interview/v2/stores/supabase-session-store.js
```

**Mensaje entrante por WhatsApp**

```text
Meta Cloud API
  → router.js (/whatsapp/webhook POST)
  → handlers/whatsapp-webhook.js (engine + ChatRuntime propios del canal)
  → services/whatsapp/whatsapp-service.js
  → services/whatsapp/webhook-handler.js (+ webhook-validator.js)
  → services/nexus/chat-runtime.js
  → NexusAIEngine o InterviewRouter
  → services/whatsapp/meta-whatsapp-channel.js
```

**Consulta con contexto conversacional (Phase 6/P8)**

```text
Usuario
  → NexusAIEngine.process()
  → ConversationContextOrchestrator.resolve(message, sessionId)  → { device, brand, model, service, product, quantity, color, material, ... }
  → workingMemory del planner enriquecida con el contexto resuelto
  → PlanningEngine (decide las tools)
  → ToolExecutor.executePlan() (respeta dependencias/paralelismo)
  → Tools (searchPrice, searchBusinessInfo, ...)
  → respuesta final
```

**Consulta de productos del catálogo (Phase 9) con grafo (Phase 10)**

```text
Usuario
  → NexusAIEngine.process()
  → ConversationContextOrchestrator.resolve(message, sessionId)  → { device, brand, model, product, quantity, color, material, ... }
  → PlanningEngine (selecciona searchProduct según la descripción de la tool)
  → ToolExecutor.executePlan() (resuelve Working Memory y referencias)
  → tool searchProduct (services/nexus/tools/index.js)
  → ProductService.search(query)  → { results: [...] }
    → BusinessKnowledgeGraph.expandTokens (alias) + ProductRepository.findAll()  → tabla products
  → respuesta estructurada (nunca texto/HTML)
```

**Consulta de stock/disponibilidad (Phase 11) con grafo**

```text
Usuario
  → NexusAIEngine.process()
  → ConversationContextOrchestrator.resolve(message, sessionId)  → { device, service, ... }
  → PlanningEngine (selecciona searchStock según la descripción de la tool)
  → ToolExecutor.executePlan() (resuelve Working Memory y referencias)
  → tool searchStock (services/nexus/tools/index.js)
  → StockService.search(query)  → { results: [{ id, product, stock, available }] }
    → BusinessKnowledgeGraph.expandTokens (alias) + StockRepository.findAll()  → tabla products (punto de integración tolerado)
  → respuesta estructurada (nunca texto/HTML)
```

**Resolución de conocimiento del dominio (Phase 9 → integrado en Phase 10)**

```text
Servicios de negocio (PriceService / ProductService / BusinessInfoService)
  → BusinessKnowledgeGraph (inyectado por DI, nunca import directo)
    → cargar fuentes: services + prices (activas) + products (punto de integración)
    → construir entidades y relaciones explícitas
    → matchear (normalización + alias) y expandir vecindario de 1 salto
  → resolve(query) → { entities, relations }   (grafo, vecindario 1 salto)
  → resolveEntities(query) / expand(entity)    (match directo / vecindario)
  → expandTokens(tokens)                       (única fuente de alias)
  → cada servicio mantiene su dominio (matching, filtrado, clasificación)
```

**Integración con el Business Knowledge Graph (Phase 10)**
- El `BusinessKnowledgeGraph` es la **única fuente de alias y resolución semántica** de entidades del dominio; los servicios lo reciben por inyección de dependencia (`new PriceService({ queryFn, knowledgeGraph })`, `new ProductService({ repository, knowledgeGraph })`, `new BusinessInfoService({ queryFn, knowledgeGraph })`).
- `PriceService` usa `knowledgeGraph.resolve(query)` para identificar dispositivos/marcas/servicios y re-expande tokens con `expandTokens`; sin grafo cae a matching estricto de tokens.
- `ProductService` delega la expansión semántica (alias) a `knowledgeGraph.expandTokens`; el matching de relevancia queda en el servicio.
- `BusinessInfoService` delega la resolución de marcas (tema `brands`) a `knowledgeGraph.resolve`; sin marcas resueltas vuelve a las FAQs.
- `StockService` delega la expansión semántica (alias) a `knowledgeGraph.expandTokens`; el matching de relevancia queda en el servicio (mismo contrato que `ProductService`). `InventoryService`/`AppointmentService` podrán consumir el mismo modelo sin duplicar alias ni estructuras.
- Tests: `price-service.test.js`, `product-service.test.js`, `business-info-service.test.js`, `stock-service.test.js` y `business-knowledge-graph.test.js` verifican el uso del grafo y que los alias solo vienen del grafo.

**Finalización de entrevista → negocio (v1 objetivo)**

```text
InterviewController
  → CompletionPipeline
    → Validation
    → ClientResolver (services/business/client-service.js)
    → CompletionHandler (services/nexus/interview/completion-handler.js)
    → SupabaseSessionStore (status='completed')
    → EventQueue
  → handlers/chat.js (respuesta enriquecida)
```

**Cambio de datos de negocio**

```text
admin/js/modules/<módulo>/
  → handlers/admin.js
  → services/business/<servicio>-service.js
  → Supabase y su migration correspondiente
```

Antes de modificar cualquiera de estos recorridos, consultar `REGLAS.md`; en
particular, las reglas de Interview, tools, acceso a datos, WhatsApp y
finalización de entrevista.

---

## Tablas de Supabase

**Activas** (tienen migration en `supabase/migrations/`):
- `business_info` — información del negocio, horarios, datos que usa Nexus
- `chatbot_config` — configuración del comportamiento del chatbot
- `clients` — datos de clientes
- `repairs` — reparaciones
- `budgets` — presupuestos
- `print_orders` — órdenes de impresión
- `interview_sessions` — sesiones activas/completadas de entrevista
- `events` — eventos del sistema (event queue)
- `event_dlq` — Dead Letter Queue de eventos fallidos
- `notifications` — registro de notificaciones enviadas
- `admin_activity_log` — log de actividad del panel admin

**Planificadas** (no tienen migration todavía):
- `products` (tabla del catálogo: `id,name,brand,category,price,currency,stock,is_active`) — punto de integración de `ProductService` y `StockService`
- `work_orders`
- `inventory`
- `employees`
- `chat_history` (actualmente en memoria del Worker)
- `audit_log`

### Tool `searchBusinessInfo` — mapeo de temas a tablas

`BusinessInfoService.search()` clasifica la consulta en un tema y lo resuelve
contra tablas existentes (no crea estructura nueva). Los temas que no tienen
tabla dedicada se resuelven contra `faqs` (p. ej. medios de pago, envíos,
tiempos de reparación, marcas). Si no hay ninguna FAQ que coincida, devuelve
`value: []` — nunca inventa contenido.

| Tema | Fuente de datos |
|---|---|
| `business_hours` | `hours` (ordenado por `day_of_week`) |
| `address` | `address` (fila única) |
| `phone` | `phones` |
| `email` | `emails` |
| `social_media` | `social_media` |
| `warranty` | `warranties` |
| `payment_methods` | `faqs` (preguntas con pago/tarjeta/transferencia/efectivo) |
| `shipping` | `faqs` (preguntas con envío/entrega) |
| `repair_time` | `faqs` (preguntas con tarda/demora/tiempo) |
| `brands` | `BusinessKnowledgeGraph.resolve(query)` (marcas del grafo) → si no resuelve, `faqs` (preguntas con marca/fabricante) — sin datos por defecto |
| sin tema | `{ topic: null, value: [] }` |

`searchBusinessInfo` solo devuelve datos estructurados `{ topic, value }`; el
LLM redacta la respuesta final (mismo contrato que `searchPrice`).

---

## Flujo completo: WhatsApp → Respuesta

```text
Usuario envía mensaje WhatsApp
  → Meta Cloud API → POST /whatsapp/webhook
    → handlers/whatsapp-webhook.js (handleWebhookPost) construye engine de canal
    → WhatsAppService → webhook-handler: webhook-validator verifica firma HMAC
    → Obtener/crear conversación (ConversationManager) + ContactResolver
    → webhook-handler recuerda/recupera el interviewSessionId (ConversationMemory, P10)
    → ChatRuntime.handleMessage() (instancia propia del canal, recibe interviewSessionId)
      → Si hay interviewSessionId persistido y activo → InterviewRouter.processMessage
        → interpreta → valida → avanza (y webhook-handler actualiza la memoria según la respuesta)
      → No → NexusAIEngine.process()
          → PlanningEngine determina plan
          → ToolExecutor ejecuta tool calls
          → ¿Interview tools ejecutadas? → interviewRouter procesa
          → Format response
    → Guardar en historial (ConversationManager)
    → meta-whatsapp-channel.sendMessage() → respuesta al usuario
```

## Flujo: Admin → Cliente

```text
Admin envía mensaje desde panel
  → admin.js: handleAdminMessage()
    → Verificar JWT
    → Verificar permisos (profile-manager: perfil admin/superadmin)
    → AdminAssistant.process()
      → Tools disponibles para admin (admin-tools, conversation-tools)
      → Respuesta formateada
    → Guardar en historial
    → Notificar al cliente vía WhatsApp
```

## Flujo: Finalización de entrevista → Negocio (v1 objetivo)

```text
Usuario completa entrevista
  → InterviewController devuelve interviewComplete=true
  → ChatRuntime / handlers/chat.js invoca CompletionPipeline
    → CompletionPipeline.validate(fields, schema)
      → Si falla: log + sin entidad; datos en interview_sessions
    → ClientResolver.resolve(name, phone) → upsert clients
    → CompletionHandler.insertEntity(schemaId) → repairs / budgets / print_orders
    → SupabaseSessionStore.update(status='completed')
    → EventQueue.emit(REPAIR_CREATED | BUDGET_CREATED | PRINT_ORDER_CREATED)
  → Respuesta al usuario con summary + structuredSummary + progress
  → Panel admin puede revisar y gestionar la entidad creada
```
