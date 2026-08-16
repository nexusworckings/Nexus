# Nexus — Tool System

The tool system is the mechanism by which the AI interacts with the application. All external actions (querying data, creating records, sending messages) go through registered tools.

## Architecture

```
NexusAIEngine ──► ToolRegistry ──► ToolExecutor ──► Individual Tools
                      │                  │
                 register(name,     execute(calls)
                 schema, fn)        returns results
```

## Tool Structure

Each tool is an object with:

```js
{
  name: 'tool:name',          // Unique identifier (namespace:action)
  description: 'What it does', // LLM prompt description
  parameters: {                // JSON Schema for arguments
    type: 'object',
    properties: { ... },
    required: [...]
  },
  execute: async (args, context) => {
    // Tool logic
    return { success: true, data: ... };
  }
}

Properties:
| Property | Required | Description |
|----------|----------|-------------|
| `name` | YES | Unique tool identifier, format: `domain:action` |
| `description` | YES | Description for the LLM to understand when to use it |
| `parameters` | YES | JSON Schema defining expected arguments |
| `execute` | YES | Async function implementing the tool logic |
```

## Tool Categories

| Category | Tools | Profile Access |
|----------|-------|---------------|
| **Conversation** | `conversation:search`, `conversation:create`, `conversation:update` | customer, admin |
| **Admin** | `admin:list`, `admin:assign`, `admin:reply`, `admin:stats` | admin |
| **Interview** | `interview:start`, `interview:process`, `interview:complete` | customer |

## Registration

Tools are registered in `tools/index.js`:

```js
import { conversationTools } from './conversation-tools.js';
import { adminTools } from './admin-tools.js';
import { interviewTools } from './interview-tools.js';

export function registerAllTools(registry) {
  conversationTools.forEach(t => registry.register(t));
  adminTools.forEach(t => registry.register(t));
  interviewTools.forEach(t => registry.register(t));
}
```

## Profile-Based Access

Tools are filtered by profile before being sent to the LLM:

| Profile | Available Tools |
|---------|----------------|
| `customer` | conversation:search, conversation:create, interview:start, interview:process, interview:complete |
| `admin` | All tools |
| `superadmin` | All tools |

Defined in `profile-manager.js`:

```js
const PROFILES = {
  customer: {
    allowedTools: ['conversation:search', 'interview:start', ...],
    instructions: 'Eres un asistente amable...',
  },
  admin: {
    allowedTools: [...allTools],
    instructions: 'Eres un asistente de administración...',
  },
};
```

## Execution Flow

1. LLM decides to call a tool → returns `tool_calls[]`
2. `NexusAIEngine` passes calls to `ToolExecutor.execute(calls, context)`
3. `ToolExecutor` looks up each tool in `ToolRegistry`
4. Validates arguments against JSON Schema
5. Executes the `execute` function
6. Returns results to the LLM for next iteration

## Adding a New Tool

1. Create `tools/my-tool.js` exporting `{ name, description, parameters, execute }`
2. Import and register in `tools/index.js`
3. Add tool name to the appropriate profile in `profile-manager.js`
4. Write tests in `tools/my-tool.test.js`

No changes needed to `nexus-ai-engine.js`, `chat-runtime.js`, or `tool-executor.js`.
