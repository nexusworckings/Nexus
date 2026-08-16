# Nexus AI Platform — Architecture

## Overview

Nexus is an AI-powered customer service and CRM platform for **Tecno San Juan**, built on Cloudflare Workers. It combines WhatsApp-based customer interaction, intelligent interview-driven quoting, an admin panel, and a full event/notification system.

## High-Level Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  WhatsApp     │────▶│  Cloudflare       │────▶│  Supabase        │
│  (Meta API)   │     │  Worker (Nexus)   │     │  (DB + Auth)     │
└──────────────┘     └──────────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │   Router    │
                    ├─────────────┤
                    │  Handlers   │
                    │  ├─ chat.js │
                    │  ├─ admin.js│
                    │  └─ API     │
                    ├─────────────┤
                    │  Nexus Core │
                    │  ├─ ChatRuntime    │
                    │  ├─ NexusAIEngine  │
                    │  ├─ ToolRegistry   │
                    │  ├─ ToolExecutor   │
                    │  ├─ PlanningEngine │
                    │  ├─ ContextManager │
                    │  └─ ProfileManager │
                    ├─────────────┤
                    │  Interview v2     │
                    │  ├─ Router        │
                    │  ├─ Controller    │
                    │  ├─ Interpreter   │
                    │  └─ Resolver      │
                    ├─────────────┤
                    │  WhatsApp        │
                    │  ├─ Webhook      │
                    │  ├─ Service      │
                    │  └─ Channels     │
                    ├─────────────┤
                    │  Events         │
                    │  ├─ Bus         │
                    │  ├─ Queue       │
                    │  ├─ Pipeline    │
                    │  └─ Worker      │
                    ├─────────────┤
                    │  Notifications  │
                    │  ├─ Service     │
                    │  └─ Channels    │
                    ├─────────────┤
                    │  Business       │
                    │  ├─ Client      │
                    │  ├─ Budget      │
                    │  ├─ Repair      │
                    │  └─ Print       │
                    └─────────────┘
```

## Core Principles

1. **AI does NOT control flow.** It interprets answers and decides which tools to execute.
2. **Separation of concerns.** Each module has a single, well-defined responsibility.
3. **No circular dependencies.** The import graph is strictly acyclic.
4. **Tool calls are the action mechanism.** All external interactions go through registered tools.
5. **Startup validation.** All service JSONs are validated at Worker startup.

## Tech Stack

- **Runtime:** Cloudflare Workers (ES modules)
- **Language:** JavaScript (ES2022+)
- **Database:** Supabase (PostgreSQL)
- **AI:** OpenRouter (multi-model gateway)
- **Auth:** Supabase Auth + JWT
- **WhatsApp:** Meta Cloud API
- **Testing:** Vitest
- **CI/CD:** GitHub Actions + Wrangler

## Project Structure

```
/
├── admin/                 # Admin panel (frontend)
│   ├── js/                # JavaScript modules
│   ├── css/               # Styles
│   ├── assets/            # Static assets
│   ├── index.html         # Admin dashboard
│   └── login.html         # Login page
├── backend/
│   └── worker/            # Cloudflare Worker (main application)
│       ├── src/
│       │   ├── handlers/          # Request handlers
│       │   ├── services/          # Business logic
│       │   │   ├── nexus/         # AI engine & tools
│       │   │   ├── interview/v2/  # Interview subsystem
│       │   │   ├── whatsapp/      # WhatsApp integration
│       │   │   ├── events/        # Event system
│       │   │   ├── notifications/ # Notification system
│       │   │   └── business/      # Business services
│       │   ├── middleware/        # Auth, CORS, etc.
│       │   ├── utils/            # Utilities
│       │   ├── api/              # API routes
│       │   └── router.js         # Main request router
│       ├── supabase/             # DB migrations
│       ├── docs/                 # Technical docs
│       ├── wrangler.toml         # Worker config
│       └── package.json
├── css/                  # Shared styles
├── js/                   # Shared JS
├── database/             # Database scripts
├── docs/                 # Repository docs
├── .github/workflows/    # CI/CD
├── .env.example          # Environment variables template
└── .gitignore
```

## Modules

### Nexus Core (`backend/worker/src/services/nexus/`)

| Module | Responsibility |
|--------|---------------|
| `chat-runtime.js` | Orchestrates incoming messages (interview vs AI) |
| `nexus-ai-engine.js` | AI engine: builds prompt, processes tool calls |
| `tool-registry.js` | Registers and validates tools |
| `tool-executor.js` | Executes tools with tracing |
| `planning-engine.js` | Determines next action from message |
| `context-manager.js` | Manages conversation context/sessions |
| `profile-manager.js` | User profiles and tool permissions |
| `conversation-manager.js` | CRUD for conversations |
| `conversation-memory.js` | Key-value memory with TTL |
| `conversation-session.js` | Conversation data model |
| `observability.js` | Metrics and tracing |

### Interview v2 (`backend/worker/src/services/interview/v2/`)

| Module | Responsibility |
|--------|---------------|
| `interview-router.js` | Bridge between Nexus and interview pipeline |
| `interview-controller.js` | Orchestrates the interview flow |
| `question-generator.js` | Generates next question text |
| `interpreter.js` | AI entity extraction (only OpenRouter call) |
| `resolver.js` | Validates entities against schema |
| `session-store.js` | Session persistence (Supabase) |

### WhatsApp (`backend/worker/src/services/whatsapp/`)

| Module | Responsibility |
|--------|---------------|
| `webhook-handler.js` | Webhook verification and message handling |
| `webhook-validator.js` | Signature validation |
| `whatsapp-service.js` | High-level WhatsApp service |
| `meta-whatsapp-channel.js` | Meta Cloud API channel |
| `message-parser.js` | Inbound message parsing |
| `contact-resolver.js` | Contact lookup/resolution |
| `media-handler.js` | Media download and processing |

### Events (`backend/worker/src/services/events/`)

| Module | Responsibility |
|--------|---------------|
| `event-bus.js` | In-memory event bus |
| `event-queue.js` | Queued event processing |
| `event-pipeline.js` | Event processing pipeline |
| `event-worker.js` | Background event worker |
| `event-repository.js` | Event persistence |

### Notifications (`backend/worker/src/services/notifications/`)

| Module | Responsibility |
|--------|---------------|
| `notification-service.js` | Sends notifications via channels |
| `notification-template.js` | Template rendering |

### Business (`backend/worker/src/services/business/`)

| Module | Responsibility |
|--------|---------------|
| `client-service.js` | Client CRUD |
| `budget-service.js` | Budget/quote management |
| `repair-service.js` | Repair order management |
| `print-service.js` | 3D printing service management |

## Data Flow

### WhatsApp Message Flow

```
User → WhatsApp → Meta API → Webhook → chat.js
  → Rate limit check → Spam detection
  → Get/create session
  → ChatRuntime.handleMessage()
    → Interview active? → InterviewRouter
    → Else → NexusAIEngine.process()
      → Build prompt with tools + profile + context
      → LLM response (text or tool calls)
      → ToolExecutor executes tools
      → Format response
  → Save to history
  → Send WhatsApp reply
```

### Admin Flow

```
Admin → Admin Panel (frontend) → API → admin.js
  → JWT verification
  → Permission check (ProfileManager)
  → AdminAssistant.process()
    → Load conversation context
    → Available admin tools
    → Formatted response
  → Save to history
  → Notify client via WhatsApp
```

### Interview Flow

```
User message → InterviewRouter
  → New? → Welcome + first question
  → Existing → Interpreter extracts entities
    → Resolver validates against schema
    → Engine advances to next question
    → Complete? → Generate summary + WhatsApp template
    → Return next question or completion
```

## Security

- Secrets are NEVER hardcoded (all from environment variables)
- API keys for OpenRouter, Supabase service_role, WhatsApp are read from `env.*`
- Admin authentication via Supabase Auth + JWT
- WhatsApp webhook signature verification
- Rate limiting and spam detection per IP
- CORS restricted to known origins
