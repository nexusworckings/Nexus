# Nexus AI Platform

AI-powered customer service and CRM platform for **Tecno San Juan**, built on Cloudflare Workers.

**Features:**
- WhatsApp-based intelligent customer interaction
- AI-driven quoting interviews (3D Printing, LED Signage, and more)
- Admin panel for conversation management
- CRM: clients, budgets, service orders
- Event-driven notification system
- Role-based access (customer / admin / superadmin)

## Architecture

```
WhatsApp ───► Cloudflare Worker (Nexus) ───► Supabase
                    │
              ┌─────┴─────┐
              │  NexusAI   │
              │   Engine   │
              ├───────────┤
              │   Tools    │
              ├───────────┤
              │ Interview  │
              │    v2      │
              ├───────────┤
              │  Events /  │
              │ Notif.     │
              └───────────┘
```

Full architecture: [docs/architecture.md](docs/architecture.md)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers (ES modules) |
| Language | JavaScript (ES2022+) |
| Database | Supabase (PostgreSQL) |
| AI | OpenRouter (multi-model) |
| Auth | Supabase Auth + JWT |
| WhatsApp | Meta Cloud API |
| Admin Panel | Vanilla JS + HTML/CSS |
| Testing | Vitest |
| CI/CD | GitHub Actions + Wrangler |

## Project Structure

```
/
├── admin/                          # Admin panel (frontend)
│   ├── index.html / login.html     # Pages
│   ├── js/                         # Client-side JS
│   └── css/                        # Styles
├── backend/worker/                 # Cloudflare Worker
│   ├── src/
│   │   ├── handlers/               # Request handlers
│   │   ├── services/
│   │   │   ├── nexus/              # AI engine & tools
│   │   │   ├── interview/v2/       # Interview subsystem
│   │   │   ├── whatsapp/           # WhatsApp integration
│   │   │   ├── events/             # Event system
│   │   │   ├── notifications/      # Notification system
│   │   │   └── business/           # CRM services
│   │   ├── middleware/             # Auth, CORS
│   │   └── router.js               # Request routing
│   ├── supabase/                   # DB migrations
│   ├── docs/                       # Technical docs
│   └── wrangler.toml               # Worker configuration
├── css/                            # Shared styles
├── js/                             # Shared JS
├── database/                       # Database scripts
├── docs/                           # Repository docs
│   ├── architecture.md             # Full architecture
│   ├── nexus-engine.md             # AI engine docs
│   ├── tools.md                    # Tool system
│   ├── whatsapp.md                 # WhatsApp integration
│   ├── crm.md                      # CRM documentation
│   └── release-checklist.md        # Release checklist
├── .github/workflows/              # CI/CD pipeline
├── .env.example                    # Environment variables
├── .gitignore
└── README.md
```

## Development Environment

El repositorio es reproducible en **Windows y Linux** con **Node 22**. La versión
exacta está fijada con **Volta** en `backend/worker/package.json` (clave
`volta.node`) y en `.nvmrc`. CI (GitHub Actions) usa `node-version: 22`.

### 1. Requisitos

- Node.js **22** (fijado con Volta; ver instalación abajo)
- npm (se instala junto con Node)
- Volta (recomendado) o nvm — para usar la versión exacta de Node 22
- Wrangler CLI (`npm install -g wrangler`)
- Una cuenta de Supabase
- Una API key de OpenRouter
- Una cuenta de Meta WhatsApp Business

### 2. Instalación de Node 22

**Linux/macOS (Volta):**

```bash
curl https://get.volta.sh | bash
# cerrar y reabrir la terminal
volta install node@22
```

**Windows (Volta):**

1. Descargar e instalar el instalador desde https://volta.sh (o `winget install Volta.Volta`).
2. Cerrar y reabrir la terminal (PowerShell o CMD).
3. `volta install node@22`

Con Volta, al pararse dentro de `backend/worker`, `node` y `npm` usan
automáticamente la versión exacta fijada en `package.json` (`volta.node`).
Usuarios que prefieran **nvm**: ejecutar `nvm use` en `backend/worker` (el
`.nvmrc` contiene la misma versión).

### 3. Instalación de dependencias

```bash
cd backend/worker
npm ci
```

`npm ci` instala las dependencias exactamente según `package-lock.json`
(no usar `npm install` como procedimiento de instalación en CI o para
reproducir el entorno).

### 4. Variables de entorno

```bash
cp ../../.env.example .dev.vars
```

Editar `.dev.vars` con las credenciales reales (ver `.env.example`):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WEBHOOK_VERIFY_TOKEN`
- `JWT_SECRET`

Los secretos críticos nunca se commitean: `OPENROUTER_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`,
`JWT_SECRET`.

### 5. Iniciar Nexus (servidor de desarrollo)

```bash
npm run dev
```

### 6. Ejecutar tests

```bash
npm test              # todos los tests (vitest run)
npm run test:watch    # modo watch
npx vitest --coverage # cobertura
```

### 7. Lint

El proyecto **no tiene linter configurado** (no hay ESLint). La única
herramienta de estilo es Prettier (ver formato abajo). Si se agrega un linter,
debe registrarse aquí.

### 8. Verificar formato

```bash
npm run format:check   # verifica sin modificar (prettier --check .)
npm run format         # escribe el formato (prettier --write .)
```

> Nota: `npm run format` reescribe archivos; usar `format:check` antes para
> verificar el estado del repo.

### Deploy

```bash
# Configure secrets
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put JWT_SECRET

# Deploy
npx wrangler deploy --env production
```

Or push to `main` (triggers GitHub Actions auto-deploy).

## Environment Variables

See [.env.example](.env.example) for the complete list of required variables.

**Critical secrets** (never commit):
- `OPENROUTER_API_KEY` — OpenRouter API key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (bypasses RLS)
- `WHATSAPP_TOKEN` — Meta WhatsApp access token
- `WHATSAPP_APP_SECRET` — Meta app secret for webhook verification
- `JWT_SECRET` — JWT signing secret

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npx vitest --coverage
```

**1800 tests** across 98 test files — all passing (Node 22, verificado en este repo).

## Modules

### Nexus Core
- **ChatRuntime** — Orchestrates message flow (interview vs AI)
- **NexusAIEngine** — AI engine with tool-calling support
- **ToolRegistry / ToolExecutor** — Tool registration and execution
- **PlanningEngine** — Intent detection and action planning
- **ContextManager** — Session and conversation context
- **ProfileManager** — User profiles and permissions

### Interview v2
Declarative interview system driven by JSON service definitions. Adding a new service requires only creating a JSON file — no code changes.

### WhatsApp Integration
Full webhook handling with signature verification, message parsing, media handling, and outbound messaging via Meta Cloud API.

### CRM
Client management, conversation tracking, budget/quote generation, repair orders, and 3D printing service management.

### Events & Notifications
Event-driven architecture with in-memory bus, queued processing, and multi-channel notifications (WhatsApp, email).

### Admin Panel
Browser-based admin dashboard for conversation management, client lookup, and system administration.

## Documentation

- [Architecture](docs/architecture.md)
- [NexusAI Engine](docs/nexus-engine.md)
- [Tool System](docs/tools.md)
- [WhatsApp Integration](docs/whatsapp.md)
- [CRM](docs/crm.md)
- [Release Checklist](docs/release-checklist.md)
- [Interview v2 Schema Spec](backend/worker/src/services/interview/v2/SCHEMA_SPECIFICATION.md)

## License

Private — Tecno San Juan
