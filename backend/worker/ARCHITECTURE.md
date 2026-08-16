# Arquitectura de Nexus — Interview Platform v2 + Nexus AI

## Principios Fundamentales

1. **La IA NO controla el flujo.** Solo interpreta respuestas y decide qué herramientas ejecutar.
2. **Separación de responsabilidades.** Cada módulo tiene una función única y bien definida.
3. **Sin dependencias circulares.** El grafo de imports es estrictamente acíclico.
4. **Los tool calls son el mecanismo de acción.** Toda interacción con el mundo exterior pasa por herramientas registradas.
5. **Validación startup.** Todos los JSON de configuración se validan al cargar el Worker.

---

## Arquitectura General

```
HTTP Request → Router → Handler (chat/admin/API)
                           │
                    ┌──────┴──────┐
                    │ ChatRuntime │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         NexusAIEngine  Interview   ProfileManager
              │         Router        │
              │            │          │
         ┌────┴────┐       │          │
         │         │       │          │
    ToolRegistry  PlanningEngine      │
         │                           │
    ToolExecutor                      │
         │                           │
    ┌────┴────┐                      │
    │ Tools   │                ┌─────┴─────┐
    │ (conv,  │                │ Profile   │
    │  admin, │                │ Permissions│
    │  interview)              └───────────┘
```

---

## Nexus — Core

### `chat-runtime.js` — Orquestador Principal

Coordina el flujo completo de un mensaje entrante:

1. Detecta si hay una entrevista activa → delega a `InterviewRouter`
2. Sino, envía a `NexusAIEngine.process()` con el contexto actual
3. Si el engine ejecuta herramientas de entrevista → `InterviewRouter` procesa
4. Formatea la respuesta final según el resultado

**Flujo:**
```
handleMessage(message, context)
  → interviewRouter.hasActiveInterview()?
    → Sí: interviewRouter.processMessage() → return
    → No: engine.process(context)
      → engine retorna { response, toolResults, ... }
      → Si ejecutó interview tools → interviewRouter finaliza
      → Si completedInterview → marca como completo
      → #formatResponse() → mensaje final
```

### `nexus-ai-engine.js` — Motor de IA

Procesa mensajes a través de un modelo de lenguaje (OpenAI/OpenRouter):

- Construye el system prompt con herramientas disponibles, perfil y contexto
- Envía el historial de mensajes al modelo
- Procesa tool calls del modelo (ejecuta herramientas)
- Retorna respuesta + resultados de herramientas ejecutadas
- **Nunca tiene estado propio** — todo el estado viene en `context`

### `tool-registry.js` — Registro de Herramientas

- Almacena herramientas como objetos `{ name, description, parameters, execute }`
- Valida schemas de herramientas al registrarlas
- Provee lista de herramientas para el prompt del modelo
- `get(name)` → herramienta individual

### `tool-executor.js` — Ejecutor de Herramientas

Ejecuta herramientas por nombre con trazabilidad:

- Recibe un array `{ name, arguments }` de tool calls
- Busca cada herramienta en el registry
- Ejecuta con validación de entrada
- Trackea ejecuciones (`byTool[toolName].executed++`)
- Retorna resultados en formato estándar `{ name, result, error? }`

### `planning-engine.js` — Planificador

Dado un mensaje y contexto, determina qué acción tomar:

- Analiza intento del mensaje
- Decide entre: responder, crear presupuesto, buscar información, derivar a admin
- Retorna un plan estructurado con acción y datos asociados
- **No ejecuta acciones** — solo planifica

### `context-manager.js` — Gestor de Contexto

Mantiene y provee el contexto de conversación:

- Almacena sesiones por `conversationId`
- Cada sesión contiene: historial de mensajes, datos del cliente, estado de entrevista, metadatos
- `updatedAt` con timestamps monotónicos para evitar colisiones
- `getSession(conversationId, clientData)` → crea o recupera

### `profile-manager.js` — Perfiles y Permisos

Gestiona perfiles de cliente/admin con sus herramientas permitidas:

- Perfiles predefinidos: `customer`, `admin`, `superadmin`
- Cada perfil define `allowedTools[]` y configuraciones
- `getProfile(profileName)` → perfil con sus tools permitidas
- `validateToolAccess(profile, toolName)` → verifica permiso

### `conversation-manager.js` — Gestor de Conversaciones

Administra sesiones de conversación activas:

- CRUD de conversaciones (`create`, `get`, `list`, `delete`)
- Filtros: por status, admin asignado, channel, cliente, texto, no leídos
- `getInactiveClients(daysThreshold)` → clientes inactivos
- `searchMessages(query)` → búsqueda en historial
- `getPendingReplies()` → conversaciones que requieren respuesta

### `conversation-memory.js` — Memoria de Conversación

Almacenamiento clave-valor por conversación con TTL:

- `remember(id, key, value, ttlMs)` → guarda con expiración opcional
- `recall(id, key)` → recupera respetando TTL
- Prune automático cada 60s (o al escribir/leer si pasó el intervalo)
- Límite de 10k entradas totales con evicción de expiradas
- Memoria separada: datos (`#memory`) + resúmenes (`#summaries`)

### `conversation-session.js` — Sesión de Conversación

Modelo de datos para una conversación individual:

- `conversationId`, `clientId`, `clientName`, `phone`, `channel`
- `status`, `assignedAdmin`, `unreadCount`
- `lastInteraction`, `history[]` (mensajes)
- `metadata` (datos adicionales como `serviceType`, `budgetId`)

### `observability.js` — Observabilidad

Métricas y tracing para el sistema:

- Trackea: latencia de engine, herramientas ejecutadas, errores, mensajes procesados
- Exporta métricas en formato estructurado
- `recordMetric(name, value, tags?)`

---

## Interview v2 — Subsystem

El subsistema de entrevistas está documentado en detalle en:
- [`SCHEMA_SPECIFICATION.md`](src/services/interview/v2/SCHEMA_SPECIFICATION.md) — Especificación completa del schema de servicios
- Código en `src/services/interview/v2/`

**Componentes clave:**

| Módulo | Responsabilidad |
|--------|----------------|
| `interview-router.js` | Puente entre Nexus e Interview v2. Decide si el mensaje necesita entrevista |
| `interview-controller.js` | Orquesta el pipeline de entrevista (pregunta → interpreta → resuelve → avanza) |
| `question-generator.js` | Genera la pregunta a mostrar según el campo pendiente |
| `interpreter.js` | Único módulo que llama a OpenRouter. Extrae entidades del mensaje |
| `resolver.js` | Valida entidades contra schema + reglas de validación |
| `session-store.js` | Persistencia de sesiones en Supabase |

**Pipeline de entrevista:**
```
1. ¿Nuevo? → pregunta inicial (welcome + primera pregunta)
2. Interpretar → AI extrae entidades del mensaje
3. Resolver → validar contra schema
4. Avanzar → engine.getNextQuestion()
5. ¿Completo? → generar resumen + template WhatsApp
```

---

## Handlers

### `chat.js` — Handler de Chat (WhatsApp)

Punto de entrada para mensajes de WhatsApp:

- **Rate limiting** por IP: `RATE_LIMIT_MAP` con cleanup periódico cada 60s
- **Spam detection**: `IN_FLIGHT` Set, `LAST_MESSAGE` Map con cleanup lazy
- **Validación de webhook**: firma, token, método
- **Pipeline**: valida → detecta servicio → crea/recupera sesión → `ChatRuntime.handleMessage()` → respuesta
- **Estados de sesión**: `new`, `active`, `interview_active`, `completed`
- **Límites**: max 10 sesiones activas por cliente, timeout de 30 min

### `admin.js` — Handler de Admin

Panel de administración para gestionar conversaciones:

- Autenticación con JWT
- CRUD de conversaciones, asignación de admin, envío de mensajes
- Ver historial, buscar, filtrar
- Estadísticas: activas, pendientes, no leídas
- Tools: `admin:list`, `admin:assign`, `admin:reply`, etc.

---

## Tools (`src/services/nexus/tools/`)

| Tool | Propósito |
|------|-----------|
| `conversation-tools` | Buscar, crear, actualizar conversaciones |
| `admin-tools` | Asignar admin, enviar respuestas, obtener estadísticas |
| `interview-tools` | Iniciar, avanzar, completar entrevistas |

Estructura de una tool:
```js
{
  name: 'tool:name',
  description: 'Descripción para el prompt del modelo',
  parameters: { /* JSON Schema */ },
  execute: async (args, context) => { /* lógica */ },
}
```

---

## Flujo Completo (WhatsApp → Respuesta)

```
Usuario envía mensaje WhatsApp
  → Webhook recibe → POST /webhook/whatsapp
    → whatsapp-service.ts verifica firma
    → chat.js: handleWebhook()
      → Rate limit check
      → Spam detection
      → Obtener/crear sesión
      → ChatRuntime.handleMessage()
        → ¿Interview activa?
          → Sí: interviewRouter.processMessage()
          → No: NexusAIEngine.process()
            → Build prompt with tools + profile + context
            → LLM response (tool calls or text)
            → ToolExecutor ejecuta tools
            → ¿Interview tools ejecutadas?
              → interviewRouter finaliza
            → Format response
      → Guardar en historial
      → Enviar respuesta WhatsApp
```

---

## Flujo de Admin (Panel → Respuesta)

```
Admin envía mensaje desde panel
  → admin.js: handleAdminMessage()
    → Verificar JWT
    → Verificar permisos (profile-manager)
    → AdminAssistant.process()
      → Contexto de la conversación
      → Tools disponibles para admin
      → Respuesta formateada
    → Guardar en historial
    → Notificar al cliente vía WhatsApp
```

---

## Tests

```bash
npm test                 # Todos los tests
npx vitest run           # Tests en CI
npx vitest --watch       # Modo desarrollo
```

**1369 tests** en 71 archivos, cubriendo:
- **Nexus Core**: NexusAIEngine, ChatRuntime, ToolRegistry, ToolExecutor, PlanningEngine, ContextManager
- **Perfiles**: ProfileManager, permisos, acceso a tools
- **Entrevistas**: InterviewRouter, v2 pipeline, schema, validación, interpretación
- **Conversaciones**: ConversationManager, ConversationSession, ConversationMemory, búsqueda
- **WhatsApp**: Webhook, mensajes, meta-channel, contacto, media
- **Admin**: Handler, admin-assistant, tools de admin
- **Eventos**: EventBus, EventQueue, EventPipeline, EventWorker, DLQ
- **Notificaciones**: Service, templates, channels
- **Business**: ClientService, RepairService, BudgetService, PrintService
- **Migración legacy**: 0 legacy dependencies, tests actualizados

---

## Performance Benchmarks

| Operación | Tiempo |
|-----------|--------|
| Engine startup (NexusAIEngine) | 0.013ms |
| ToolRegistry.get | 0.0001ms |
| ToolExecute (sync) | 0.004ms |
| PlanningEngine.createPlan | 0.012ms |
| ContextManager.getSession | 0.00004ms |
| ConversationManager.list (100) | 0.25ms |
| MessageParser.parse | 0.003ms |
| Interview v2 full pipeline | ~150ms |
| WhatsApp webhook (sin IA) | ~5ms |

---

## Memory Management

| Component | Estrategia |
|-----------|-----------|
| ConversationMemory | TTL con prune automático cada 60s, max 10k entries |
| Chat IN_FLIGHT | Set, limpiado al finalizar cada request |
| Chat LAST_MESSAGE | Cleanup lazy cada 50s (10× SPAM_WINDOW) |
| Chat RATE_LIMIT_MAP | Cleanup periódico cada 60s |
| ConversationManager | Sesiones sin límite duro (efímeras en Worker) |
| Event listeners | Pattern: `on()`/`off()` con cleanup explícito |
| Timers | Todos referenciados para posible cancelación |

---

## Agregar una Nueva Tool

1. Crear archivo en `src/services/nexus/tools/mi-tool.js`
2. Exportar objeto con `{ name, description, parameters, execute }`
3. Importar y registrar en `tools/index.js`
4. Agregar al perfil correspondiente en `profile-manager.js` (`allowedTools[]`)
5. Escribir tests en `tools/mi-tool.test.js`

**No modificar:**
- `nexus-ai-engine.js` (no necesita saber de tools individuales)
- `chat-runtime.js` (no cambia la orquestación)
- `tool-executor.js` (ejecuta cualquier tool registrada)

---

## Depuración

### Módulos y prefijos de log

| Prefijo | Módulo |
|---------|--------|
| `[NEXUS]` | NexusAIEngine |
| `[CHAT]` | ChatRuntime / chat.js |
| `[TOOL]` | ToolExecutor |
| `[PLAN]` | PlanningEngine |
| `[CTX]` | ContextManager |
| `[ADMIN]` | admin.js / AdminAssistant |
| `[INTERVIEW]` | Interview v2 pipeline |

### Problemas comunes

**El modelo no ejecuta herramientas:**
→ Verificar que las tools están en el prompt (tool-registry + profile)
→ Verificar que `allowedTools[]` en el perfil incluye las tools

**La entrevista no se inicia:**
→ `interview-router.hasActiveInterview()` no detecta estado
→ Verificar que `context.interviewState` se propaga correctamente

**Rate limiting falso positivo:**
→ Verificar `RATE_LIMIT_MAP` cleanup interval
→ Ajustar `RATE_LIMIT_MAX` y `RATE_LIMIT_WINDOW` en chat.js

**La IA responde sin usar herramientas:**
→ PlanningEngine no detectó acción
→ El system prompt no incluye instrucciones suficientes sobre tool calls
