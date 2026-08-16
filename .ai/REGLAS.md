# REGLAS.md — Nexus

Cosas que no se pueden romper sin pensarlo dos veces y documentar el cambio.

---

## Reglas técnicas

### Acceso a datos
- El frontend nunca accede directamente a Supabase. Toda consulta pasa por el
  Cloudflare Worker.
- Toda lógica sensible (llamadas a OpenRouter, manejo de credenciales, decisiones
  de acceso) vive en el Worker, no en el cliente.
- Toda tabla nueva en Supabase requiere RLS antes de usarse en producción.
- Los permisos de acceso dependen del rol del usuario (Auth + RLS + profile-manager),
  no de checks manuales en el frontend.

### Motor de IA
- La IA NO controla el flujo de la aplicación. Solo interpreta mensajes y decide
  qué tool calls ejecutar. El flujo (estado de entrevista, sesión, respuesta final)
  lo controla código determinístico (`ChatRuntime`, `InterviewRouter`).
- Toda interacción del LLM con el exterior pasa por herramientas registradas en el
  `ToolRegistry`. No debe haber acceso directo a Supabase desde el motor de IA.
- `nexus-ai-engine.js` no tiene estado propio — todo el estado viene en `context`.
  No agregarle propiedades de estado.
- No modificar `nexus-ai-engine.js`, `chat-runtime.js` ni `tool-executor.js` para
  agregar una nueva herramienta. El proceso correcto está en REGLAS.md, sección
  "Cómo agregar una nueva tool".

### Herramientas (tools)
- Las tools tienen estructura `{ name, description, parameters, execute }`.
- Un perfil (`customer`, `admin`, `superadmin`) define `allowedTools[]`. Una tool no
  disponible en el perfil no puede ser ejecutada, aunque el LLM la llame.
- Si se agrega una nueva tool, debe registrarse en `tools/index.js` Y agregarse al
  `allowedTools[]` del perfil correspondiente en `profile-manager.js`.

### Interview
- El subsistema Interview tiene su propio intérprete que llama a OpenRouter
  (`services/interview/v2/interpreter.js`). Es el único punto de contacto del
  subsistema con la IA externa. No duplicar esta lógica en el engine general.
- El flujo de entrevista es estrictamente lineal según el schema del servicio. No
  saltear pasos ni modificar el orden sin actualizar el schema.

### WhatsApp
- La verificación de firma HMAC del webhook de Meta se realiza siempre en
  `webhook-validator.js` antes de procesar cualquier mensaje.
- El rate limiting y spam detection del `chat.js` no deben desactivarse en
  producción (protegen contra abuso de la API de OpenRouter).
- **Hallazgo crítico abierto (2026-08-12, auditoría POST-P9):** el webhook no
  persiste el `interviewSessionId` entre turnos, por lo que la entrevista
  multi-turn NO continúa en WhatsApp (a diferencia del chat web, que conserva
  `body.interview.sessionId`). El fix está **en diseño, no implementado**.
  NO modificar `webhook-handler.js`, `chat-runtime.js`, `InterviewController`,
  `StateKeeper` ni `ConversationMemory` hasta resolver la arquitectura (ver
  `INFORME-AUDITORIA-POST-P9.md` y `DECISIONES.md`).

### Tests
- Cada nuevo módulo o servicio de backend debe tener tests en Vitest.
- No modificar la interfaz pública de un módulo sin actualizar sus tests.
- Los tests son la documentación ejecutable de los contratos entre módulos — no
  eliminar tests sin entender qué contrato cubren.

---

## Reglas de negocio

- Una reparación pertenece a un cliente (no se crean reparaciones huérfanas).
- No crear clientes duplicados (verificar por teléfono o email antes de crear).
- El módulo Interview ocurre antes que el módulo Repair — no se puede iniciar una
  reparación sin datos del cliente y del dispositivo.
- Los estados de una reparación siguen este orden:
  **Pendiente → Diagnóstico → En reparación → Finalizado → Entregado**.
  No saltear estados ni ir hacia atrás sin lógica explícita.
- Los presupuestos están asociados a un cliente o a una reparación, nunca son
  entidades flotantes.

---

## Cosas conocidas que NO son errores (deuda técnica aceptada)

Esta sección existe para que una IA nueva no "corrija" algo que en realidad es una
elección consciente por etapa del proyecto.

- **Historial de chat en memoria**: `chat_history` todavía no persiste en Supabase —
  vive en el `ConversationManager` (in-memory en el Worker). Planificado, no
  implementado. No es un bug.
- **`work_orders`, `inventory`, `employees`, `audit_log`**: no existen todavía en
  Supabase. Planificadas, no implementadas.
- **Panel admin incompleto**: funcionalidad parcial ahí es esperable, está en
  construcción activa. No señal de que algo se rompió.
- **Frontend sin framework**: a propósito (ver DECISIONES.md). No proponer migrar a
  React/Vue/Svelte sin que eso se discuta como decisión nueva.
- **`print-orders`**: es un módulo del rubro anterior (impresión 3D/LED). Está en el
  código pero su continuidad en el proyecto de Tecno San Juan está pendiente de
  decisión.
- **`anti-loop.js` en interview**: mecanismo defensivo para evitar bucles infinitos
  en el flujo de entrevista. No es código muerto.

---

## Memoria estructurada (`.ai/`)

- `.ai/` describe **siempre el estado actual del proyecto**.
- Funcionalidades futuras, experimentales o planificadas deben identificarse
  explícitamente como tales (p. ej. "planificado", "en diseño", "no implementado")
  y **nunca presentarse como implementadas**.
- Si un módulo existe en el código pero su uso está pendiente de decisión de
  negocio, debe indicarse (p. ej. `print-orders`: servicio existente, uso final en
  revisión).
- Antes de modificar `.ai/`, verificar la información contra el código real.
  Si hay contradicción, informar la inconsistencia antes de actualizar la memoria.

---

## Cómo agregar una nueva tool (proceso obligatorio)

1. Crear `src/services/nexus/tools/mi-tool.js` con `{ name, description, parameters, execute }`.
2. Importar y registrar en `tools/index.js`.
3. Agregar al `allowedTools[]` del perfil correcto en `profile-manager.js`.
4. Escribir tests en `tools/mi-tool.test.js`.
5. Documentar el cambio en CAMBIOS.md.

**No tocar** `nexus-ai-engine.js`, `chat-runtime.js` ni `tool-executor.js`.

---

# Reglas de arquitectura v1

## Finalización de entrevistas

- **Completion Pipeline** (`services/completion/`) es el **único lugar autorizado**
  para crear registros de negocio (`repairs`, `budgets`, `print_orders`, `clients`)
  como resultado de una entrevista completada.
- Los handlers (`chat.js`, `whatsapp-webhook.js`) **no insertan directamente** en
  tablas de negocio. Invocan el pipeline.
- La completitud natural de una entrevista = todos los campos `required`
  no-skipped están completos. El intent `FINISH` genera un lead parcial.
- Antes de insertar, el pipeline valida campos críticos del negocio. Si faltan,
  no se crea la entidad; los datos permanecen en `interview_sessions`.
- Al completar, `interview_sessions.status` pasa a `'completed'`.

## Sesiones de entrevista

- La fuente de verdad de las sesiones de entrevista es Supabase
  (`interview_sessions`) a través de `SupabaseSessionStore`.
- Cloudflare KV (`services/session-store.js`) es legacy para sesiones de
  conversación; no se usa para entrevistas v2.
- Existen dos identificadores separados:
  - **session** = conversación (legacy, memoria/KV).
  - **interview** = entrevista v2 (UUID generado por `StateKeeper`, persistido en
    Supabase).
  No confundirlos ni mezclarlos.

## Datos del cliente

- Un cliente se resuelve/crea por teléfono (`ClientResolver`) antes de crear una
  entrevista de negocio. No se duplican clientes.
- El botón WhatsApp usa el teléfono del negocio obtenido de
  `/api/public/business-info`; el backend no envía `data.phone` en la respuesta de
  completado.

## Primer mensaje de una entrevista

- El mensaje que dispara una entrevista se persiste en
  `state.metadata.initialMessage`.
- `InterviewController.start(schema, message)` interpreta el mensaje con el
  `Interpreter` y aplica los campos extraídos que pasen la validación del schema.
- Los campos inválidos se descartan; no se guardan como datos de negocio.
- Si el `Interpreter` falla o no está disponible, el mensaje se conserva en
  metadata y la entrevista comienza normalmente desde la primera pregunta.
- No se aplica extracción para intents `CANCEL`, `FINISH` o `HELP`.

## Calidad de datos en entrevistas

- El fallback heurístico (usar el mensaje crudo como respuesta del campo
  pendiente cuando el Interpreter devuelve vacío) aplica solo a campos
  `text`/`phone`/`email`/`number`.
- No extender ese fallback a `select`/`multiselect` sin una estrategia de
  matching de opciones, porque puede provocar bucles de pregunta repetida.
- Frases obvias de evasión ("no sé", "nada", "cancelar", "salir") no deben
  guardarse como datos de negocio.

## Estados como colas de revisión

- `repairs.status='received'` y `budgets.status='pending'` representan entidades
  aún no revisadas por un humano. El panel admin es la cola de validación.
- No implementar un modo dry-run técnico separado: la revisión humana en el
  panel es el mecanismo de validación.

## Preparación para capacidades futuras

- Nuevas capacidades de IA se integran como **tools** registradas en
  `ToolRegistry` y habilitadas en un perfil.
- Nuevos canales (Telegram, etc.) deben reusar `ChatRuntime` y el Completion
  Pipeline, no reimplementar la lógica de finalización.
- La memoria de conversaciones se agregará extendiendo `ContextManager` + una
  tabla `chat_history`; no hardcodear historial en handlers.
- Automatizaciones se implementan como suscriptores al event bus/queue
  existente.
