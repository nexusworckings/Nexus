# Nexus Architecture v1

## Propósito

Nexus es el asistente de inteligencia artificial de Tecno San Juan. Conecta clientes (chat web y WhatsApp) con la operación del negocio (reparaciones, presupuestos, órdenes de impresión 3D, clientes) y con el panel administrativo.

La **Arquitectura v1** define cómo organizar el sistema para que cualquier interfaz futura —nuevos canales, Tool Calling, MCP, agentes especializados, automatizaciones, memoria de conversaciones— reutilice los mismos servicios de dominio sin duplicar lógica.

## Principios arquitectónicos

1. **La IA no controla el flujo.** Razona, interpreta y elige tools. El flujo (entrevista activa, completitud, respuesta final) lo controla código determinístico (`ChatRuntime`, `InterviewRouter`, `FlowEvaluator`).
2. **Tools como único mecanismo de acción.** Toda interacción de la IA con el mundo externo pasa por `ToolRegistry`.
3. **Separación estricta: Adaptadores → Dominio → Infraestructura.** Los adaptadores (web, WhatsApp, admin) no conocen Supabase ni OpenRouter; hablan con handlers que componen servicios de dominio.
4. **Estado fuera del motor.** `NexusAIEngine` y `InterviewController` no guardan estado. El estado vive en sesiones de conversación y de entrevista.
5. **Entrevistas declarativas.** Un servicio nuevo se define mediante un schema JSON (`fields`, `skipIf`, `dependsOn`, `inferences`); el motor lo ejecuta sin cambios de código.
6. **Finalización como pipeline de dominio.** Cuando una entrevista termina, un único punto de orquestación (Completion Pipeline) valida, resuelve cliente, crea la entidad de negocio y emite eventos. Ningún handler crea registros de negocio directamente.
7. **Eventos para efectos secundarios.** Notificaciones, analytics y automatizaciones se desacoplan mediante el event bus/queue existente.

---

## Capas y componentes

### 1. Adaptadores (interfaces externas)

Responsabilidad: recibir input del mundo exterior y presentar output. **No contienen lógica de negocio.**

| Componente | Tecnología | Ubicación | Responsabilidad |
|---|---|---|---|
| Chat web público | HTML + JS vanilla | `index.html`, `js/chatbot.js`, `js/api.js`, `js/renderer.js`, `js/whatsapp.js` | Widget de chat, envío de mensajes, botón WhatsApp, render de entrevistas. |
| Panel administrativo | HTML + JS vanilla | `admin/index.html`, `admin/js/` | CRUD, dashboard, asistente IA interno. |
| WhatsApp Adapter | Meta Cloud API | `services/whatsapp/`, `handlers/whatsapp-webhook.js` | Verificación de webhook, parseo de mensajes, envío de respuestas. |
| API REST / Router | Cloudflare Worker | `router.js`, `handlers/*.js`, `api/interview/v2/routes.js` | Enrutamiento HTTP, rate limiting, auth, CORS, composición de servicios. |

### 2. Dominio (lógica de negocio reusable)

Responsabilidad: contener las reglas del negocio. **No depende de adaptadores.**

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Interview v2 | `services/interview/v2/` | Recolección estructurada de datos: schemas, state, flow, questions, interpreter, validation. |
| Completion Pipeline | `services/completion/` | Único punto de orquestación de finalización: validación → cliente → entidad → evento. |
| Business services | `services/business/` | CRUD de clientes, reparaciones, presupuestos, órdenes de impresión. |
| Events | `services/events/` | Bus, cola, repositorio, worker y DLQ de eventos. |
| Notifications | `services/notifications/` | Templates y canales de notificación. |

### 3. Motor de IA (razonamiento + orquestación)

Responsabilidad: interpretar lenguaje natural y ejecutar tools, **sin estado propio.**

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| ChatRuntime | `services/nexus/chat-runtime.js` | Decididor determinístico: ¿entrevista activa? → InterviewRouter; sino → NexusAIEngine. |
| NexusAIEngine | `services/nexus/nexus-ai-engine.js` | Motor de IA: prompt, LLM, tool calls. |
| PlanningEngine | `services/nexus/planning-engine.js` | Determina plan/intención sin ejecutar. |
| ToolRegistry / ToolExecutor | `services/nexus/tool-*.js` | Registro y ejecución de herramientas. |
| ProfileManager | `services/nexus/profile-manager.js` | Perfiles `customer`/`admin`/`superadmin` con `allowedTools[]`. |
| Context/Conversation managers | `services/nexus/context-manager.js`, `conversation-manager.js`, `conversation-memory.js`, `conversation-session.js` | Estado de conversación en memoria (historial, tareas, metadata). |
| Tools | `services/nexus/tools/` | Tools de conversación, admin e interview. |
| AdminAssistant | `services/nexus/admin-assistant.js` | Variante del engine para el panel admin. |

### 4. Infraestructura

Responsabilidad: conectar con sistemas externos y servicios transversales.

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Supabase client | `services/supabase.js` | Cliente PostgreSQL. |
| OpenRouter adapter | `services/openrouter.js`, `services/interview/v2/ai-adapter.js` | LLM gateway. |
| Web search | `services/websearch.js` | Búsqueda web. |
| Session stores | `services/interview/v2/stores/` | `SupabaseSessionStore` (producción) y `MemorySessionStore` (tests). |
| KV legacy | `services/session-store.js`, `services/conversation/session.js` | Sesiones legacy de conversación (solo reset/admin). |
| Auth / JWT | `middleware/auth.js`, `utils/jwt.js` | Validación JWT, JWKS. |
| Observability | `services/nexus/observability.js`, `services/logger.js` | Métricas y logs. |

---

## Flujo de datos

### A. Mensaje del chat web

```text
js/chatbot.js → js/api.js → POST /chat → handlers/chat.js
  → ChatRuntime.handleMessage()
    → InterviewRouter (intención / entrevista activa)
      → InterviewController (v2)
        → SupabaseSessionStore (interview_sessions)
    → o NexusAIEngine + tools
  → Respuesta JSON { response, session, interview, summary?, structuredSummary?, progress? }
→ js/chatbot.js renderiza
```

### B. Mensaje de WhatsApp

```text
Meta → POST /whatsapp/webhook → handlers/whatsapp-webhook.js
  → WhatsAppService → services/whatsapp/webhook-handler.js
  → ChatRuntime.handleMessage() (propio de WhatsApp, con su engine e interviewRouter)
    → InterviewRouter / InterviewController
    → o NexusAIEngine + tools
  → services/whatsapp/meta-whatsapp-channel.sendMessage()
```

> **Nota (auditoría 2026-08-12):** el canal WhatsApp tiene **su propia instancia**
> de `ChatRuntime`/`NexusAIEngine` construida en `handlers/whatsapp-webhook.js` —
> NO pasa por `handlers/chat.js`. Además, el webhook no persiste el
> `interviewSessionId` entre turnos (hallazgo crítico; ver
> `INFORME-AUDITORIA-POST-P9.md` y `DECISIONES.md`).

### C. Finalización de entrevista → negocio

```text
InterviewController → interviewComplete=true
  → CompletionPipeline.execute(session, completedFields)
    1. validate(fields, schema)
    2. ClientResolver.resolve(name, phone) → upsert clients
    3. CompletionHandler.insertEntity(schemaId) → repairs / budgets / print_orders
    4. sessionStore.update(status='completed')
    5. emitEvent(REPAIR_CREATED | BUDGET_CREATED | PRINT_ORDER_CREATED)
  → Respuesta enriquecida
```

---

## Reglas de dependencias permitidas

```text
Adaptadores (web / WhatsApp / admin)
        ↓  (HTTP / eventos)
    Handlers / Router
        ↓  (llamadas síncronas, inyección)
   Dominio (interview, business, completion, events)
        ↓  (a través de interfaces)
   Infraestructura (supabase, openrouter, kv, websearch)
```

### Prohibiciones

- Un adaptador no llama directamente a Supabase ni a OpenRouter.
- Un handler no inserta directamente en tablas de negocio (salvo admin CRUD explícito).
- El motor de IA no accede a base de datos fuera de tools.
- El dominio no depende de HTTP ni de canales específicos.

---

## Integración de capacidades futuras

| Capacidad futura | Dónde se integra | Reutiliza |
|---|---|---|
| Tool Calling / MCP | Nueva tool en `services/nexus/tools/` + perfil | `ToolRegistry`, `ProfileManager` |
| Búsqueda web | Ya existe `services/websearch.js`; wrap como tool | `NexusAIEngine` |
| Búsqueda de precios | Nuevo `PriceService` en dominio + nueva tool | `ToolRegistry`, business services |
| Agente administrativo | Nuevo perfil/assistant + `allowedTools` | `AdminAssistant`, business services |
| Memoria de conversaciones | Extensión de `ContextManager` + tabla `chat_history` | Conversation session, events |
| Automatizaciones | Suscriptor al event bus/queue | Event system, notifications |
| Nuevo canal (Telegram, etc.) | Nuevo adapter + handler que reusa `ChatRuntime` | `ChatRuntime`, Completion Pipeline |
| Nuevo servicio de entrevista | Schema JSON en `interview/v2/schemas/` | Interview v2 sin código nuevo |

---

## Estado actual vs. arquitectura v1

| Aspecto | Estado actual | Objetivo v1 |
|---|---|---|
| Finalización de entrevista | Completion Pipeline cableado en `handlers/chat.js`: crea cliente + entidad (`repairs`/`budgets`/`print_orders`) y marca la sesión `'completed'` | Respuesta enriquecida + eventos/notificaciones |
| Contrato de completado | Incompleto (faltan `summary`/`structuredSummary`/`progress`) | Contrato completo y documentado |
| `minimumRequired` | Eliminado en los 3 schemas (`repair-request`, `print-order`, `budget-request`) | Completitud por campos requeridos en los 3 schemas |
| Status de sesión | `'active'` durante la entrevista; `'completed'` al completar (vía `markCompleted`) | `'completed'` al terminar |
| Primer mensaje | Persistido en metadata, campos válidos extraídos se aplican automáticamente | Igual; validación por schema garantiza que no se guarden valores inválidos |
| Canal WhatsApp + finalización | Webhook presente, sin persistencia de negocio | Reusa Completion Pipeline |

---

## Cómo orientarse rápido

1. Un mensaje entra por `handlers/chat.js` (web) o `handlers/whatsapp-webhook.js` (WhatsApp, con su propia instancia de `ChatRuntime`/engine) o `admin.js` (panel).
2. `ChatRuntime` decide entre entrevista e IA general.
3. `NexusAIEngine` razona mediante tools; `InterviewController` ejecuta el flujo estructurado.
4. Toda lógica sensible y acceso a Supabase/OpenRouter vive en el Worker.
5. Al completar una entrevista, el único lugar autorizado para crear registros de negocio es el **Completion Pipeline**.
6. Antes de cambiar arquitectura, módulos, reglas o decisiones, actualizar `.ai/`.
