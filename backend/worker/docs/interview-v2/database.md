# Interview V2 — Base de Datos

## Tabla: `interview_sessions`

Almacena el estado completo de cada entrevista del módulo Interview V2.

### Columnas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `UUID PK` | Identificador único, generado por la aplicación (`crypto.randomUUID()`) |
| `schema_id` | `TEXT NOT NULL` | Identificador del schema de entrevista (ej: `"service_request"`) |
| `user_id` | `UUID NULL` | Reservado para futura integración con autenticación de usuarios |
| `status` | `TEXT NOT NULL` | Estado actual: `'active'`, `'completed'`, `'expired'` |
| `state` | `JSONB NOT NULL` | Estado completo de la entrevista (ver estructura abajo) |
| `schema` | `JSONB NOT NULL` | Snapshot del schema de entrevista usado al crear la sesión |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación, autoasignado |
| `updated_at` | `TIMESTAMPTZ` | Fecha de última modificación, autoactualizado por trigger |

### Check constraints

- `status IN ('active', 'completed', 'expired')` — solo valores válidos

### Índices

| Índice | Columnas | Propósito |
|--------|----------|-----------|
| `idx_interview_sessions_schema_id` | `schema_id` | Consultas administrativas y analíticas por tipo de entrevista |
| `idx_interview_sessions_status` | `status` | Filtrado rápido de sesiones activas/completadas |
| `idx_interview_sessions_created_at` | `created_at DESC` | Listar sesiones recientes, limpieza de sesiones antiguas |
| `idx_interview_sessions_user_id` | `user_id` (partial, `WHERE user_id IS NOT NULL`) | Consultas por usuario cuando se implemente auth |

### Trigger

- `trg_interview_sessions_updated_at` — actualiza `updated_at = now()` en cada `UPDATE`

---

## Estructura JSON de `state`

```json
{
  "answers": {
    "device": "Samsung A54",
    "problem": "pantalla rota"
  },
  "currentField": "problem",
  "history": [
    { "fieldId": "device", "value": "Samsung A54" }
  ]
}
```

### Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `answers` | `object` | Mapa de fieldId → valor respondido |
| `currentField` | `string \| null` | ID del campo actual (null si completada) |
| `history` | `array` | Historial ordenado de respuestas |

Cada entrada en `history`:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `fieldId` | `string` | ID del campo respondido |
| `value` | `any` | Valor respondido |

---

## Flujo de almacenamiento

```
HTTP Request
    │
    ▼
InterviewController.start(schema)
    │
    ▼
SupabaseSessionStore.create(sessionId, data)
    │
    ├── Serializa state → JSON (StateKeeper.toJSON())
    ├── INSERT INTO interview_sessions (id, schema_id, status, state, schema)
    ├── Guarda en caché local (write-through)
    │
    ▼
InterviewController.answer(sessionId, answer)
    │
    ▼
SupabaseSessionStore.get(sessionId)
    │
    ├── Cache hit → devuelve datos cacheados
    ├── Cache miss → SELECT ... WHERE id = sessionId
    │                 → deserializa con StateKeeper.fromJSON()
    │                 → actualiza caché
    │
    ▼
InterviewController procesa respuesta
    │
    ▼
SupabaseSessionStore.update(sessionId, { state })
    │
    ├── UPDATE interview_sessions SET state = ... WHERE id = sessionId
    ├── Actualiza caché local
```

## Seguridad

### Row Level Security (RLS)

| Política | Operación | Acceso |
|----------|-----------|--------|
| `service_role_all_select` | `SELECT` | Solo `service_role` |
| `service_role_all_insert` | `INSERT` | Solo `service_role` |
| `service_role_all_update` | `UPDATE` | Solo `service_role` |
| `service_role_all_delete` | `DELETE` | Solo `service_role` |

### Principios

1. **Service role bypass**: El Cloudflare Worker usa `SUPABASE_SERVICE_ROLE_KEY`, que omite RLS automáticamente. Todas las operaciones del `SupabaseSessionStore` funcionan sin necesidad de políticas adicionales.
2. **Bloqueo anónimo**: Usuarios anónimos (sin autenticar) no pueden leer ni escribir en la tabla.
3. **Futura integración con usuarios**: Cuando se implemente autenticación, se crearán políticas que verifiquen `user_id = auth.uid()` para que cada usuario acceda solo a sus propias sesiones.

## Futura integración con usuarios

Cuando se implemente autenticación:

1. El frontend enviará `user_id` al crear la sesión
2. `SupabaseSessionStore.create()` incluirá `user_id` en el `INSERT`
3. Se agregarán políticas RLS como:

```sql
CREATE POLICY "users_select_own"
  ON interview_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own"
  ON interview_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

4. Las políticas `service_role_all_*` se mantendrán para el Worker

## Variables de entorno requeridas

| Variable | Propósito |
|----------|-----------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role para el Worker |

## Migración

Archivo: `backend/worker/supabase/migrations/create_interview_sessions.sql`

Para aplicar:

```bash
# Opción 1: SQL Editor de Supabase
# Copiar y pegar el contenido del archivo

# Opción 2: migración desde el backend
# (futuro - cuando se implemente sistema de migraciones)
```
