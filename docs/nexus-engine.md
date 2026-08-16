# NexusAIEngine

The NexusAIEngine is the core AI processing module. It transforms incoming messages into structured responses by combining:

- Conversation context
- Available tools (registered in ToolRegistry)
- User profile permissions
- AI model inference via OpenRouter

## Architecture

```
Input: { message, context, profile }
  │
  ├─► Build System Prompt
  │     ├─ Profile instructions
  │     ├─ Available tools (from ToolRegistry, filtered by profile)
  │     └─ Context (history, working memory)
  │
  ├─► Send to LLM (OpenRouter)
  │     ├─ Messages history
  │     └─ Tool definitions
  │
  ├─► Process Response
  │     ├─ Text-only response → return
  │     └─ Tool calls → ToolExecutor.execute()
  │         └─ Loop until no more tool calls
  │
  └─► Return { response, toolResults, ... }
```

## Key Components

### `NexusAIEngine` class

```js
const engine = new NexusAIEngine({ toolRegistry, profileManager, model? });
const result = await engine.process(context);
// result = { response, toolCalls, toolResults, completedInterview }
```

### System Prompt Construction

The system prompt is built dynamically per request:

1. **Profile instructions** — behavior rules from `profileManager.getProfile()`
2. **Tool definitions** — all tools the profile has access to (name, description, parameters JSON Schema)
3. **Context** — conversation history, working memory, current interview state

### Tool Call Handling

When the LLM responds with `tool_calls`:

1. Each call is validated against the registered tool schema
2. `ToolExecutor.execute()` runs each call
3. Results are fed back to the LLM
4. The loop continues until the LLM produces a text response or max iterations

### Response Format

```js
{
  response: 'Text response to user',
  toolCalls: [{ name, arguments }],
  toolResults: [{ name, result }],
  completedInterview: false,
  metadata: { model, latency, tokens }
}
```

## Usage

```js
import { NexusAIEngine } from './nexus-ai-engine.js';

const engine = new NexusAIEngine({
  toolRegistry,
  profileManager,
  model: 'openai/gpt-4o-mini', // optional, defaults to env.OPENROUTER_MODEL
});

const result = await engine.process({
  message: 'Quiero un presupuesto',
  conversationId: 'abc123',
  history: [{ role: 'user', content: 'Hola' }],
  workingMemory: { serviceType: 'impresion_3d' },
  profile: 'customer',
});
```

## Configuration

Requires env vars:
- `OPENROUTER_API_KEY` — API key for OpenRouter
- `OPENROUTER_MODEL` — Default model (e.g. `openai/gpt-4o-mini`)
- `OPENROUTER_BASE_URL` — Base URL (default: `https://openrouter.ai/api/v1`)

## Error Handling

- Missing API key → throws `AIConfigurationError`
- LLM request fails → returns error response, does not crash
- Tool execution error → includes error in tool result, continues
- Max iterations exceeded → returns partial response
