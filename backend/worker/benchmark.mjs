import { NexusAIEngine } from './src/services/nexus/nexus-ai-engine.js';
import { ToolRegistry } from './src/services/nexus/tool-registry.js';
import { ToolExecutor } from './src/services/nexus/tool-executor.js';
import { ProfileManager } from './src/services/nexus/profile-manager.js';
import { ContextManager } from './src/services/nexus/context-manager.js';
import { PlanningEngine } from './src/services/nexus/planning-engine.js';
import { ConversationManager } from './src/services/nexus/conversation-manager.js';
import { ConversationMemory } from './src/services/nexus/conversation-memory.js';
import { MetaWhatsAppChannel } from './src/services/whatsapp/meta-whatsapp-channel.js';
import { WebhookHandler } from './src/services/whatsapp/webhook-handler.js';
import { MessageParser } from './src/services/whatsapp/message-parser.js';
import { WebhookValidator } from './src/services/whatsapp/webhook-validator.js';
import { MetricsCollector } from './src/services/nexus/observability.js';

function measure(label, fn, iterations = 1000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn(i);
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;
  console.log(`${label}: ${total.toFixed(2)}ms total, ${avg.toFixed(4)}ms avg (${iterations} iterations)`);
  return avg;
}

async function measureAsync(label, fn, iterations = 100) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn(i);
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;
  console.log(`${label}: ${total.toFixed(2)}ms total, ${avg.toFixed(4)}ms avg (${iterations} iterations)`);
  return avg;
}

// 1. Engine startup
console.log('\n=== ENGINE STARTUP ===');
measure('Engine constructor (cold)', () => new NexusAIEngine({
  chatFn: async () => JSON.stringify({ plan: [], explanation: 'test' }),
}), 100);

// Pre-create one to warm up JIT
const warmEngine = new NexusAIEngine({ chatFn: async () => 'test' });

// 2. Tool registry operations
console.log('\n=== TOOL REGISTRY ===');
const registry = new ToolRegistry();
registry.register({ name: 'testTool', description: 'A test tool', execute: async () => 'ok' });
measure('ToolRegistry.get()', () => registry.get('testTool'), 10000);
measure('ToolRegistry.exists()', () => registry.exists('testTool'), 10000);

// 3. Tool execution
console.log('\n=== TOOL EXECUTION ===');
const executor = new ToolExecutor({ toolRegistry: registry });
await measureAsync('ToolExecutor.execute() (sync tool)', () =>
  executor.execute('testTool', {})
, 500);

registry.register({
  name: 'slowTool',
  description: 'Slow tool',
  execute: async () => { const p = new Promise(r => setTimeout(r, 1)); await p; return 'done'; },
});
await measureAsync('ToolExecutor.execute() (1ms tool)', () =>
  executor.execute('slowTool', {})
, 50);

// 4. Planner
console.log('\n=== PLANNING ENGINE ===');
const chatFn = async () => JSON.stringify({ plan: [], explanation: 'test response' });
const planner = new PlanningEngine({ chatFn });
await measureAsync('PlanningEngine.createPlan (empty)', () =>
  planner.createPlan('test', { availableTools: [] })
, 100);

// 5. ContextManager
console.log('\n=== CONTEXT MANAGER ===');
const cm = new ContextManager();
cm.createSession('bench-session', { clientId: 'c1' });
measure('ContextManager.getSession()', () => cm.getSession('bench-session'), 50000);
measure('ContextManager.hasSession()', () => cm.hasSession('bench-session'), 50000);
measure('ContextManager.addMessage()', (i) => cm.addMessage('bench-session', 'user', `msg ${i}`), 1000);
measure('ContextManager.getWorkingMemory()', () => cm.getWorkingMemory('bench-session', 'clientId'), 50000);

// 6. ConversationManager
console.log('\n=== CONVERSATION MANAGER ===');
const conv = new ConversationManager();
measure('ConversationManager.createConversation()', (i) =>
  conv.createConversation({ conversationId: `bench-${i}`, phone: '5492645555', channel: 'whatsapp' })
, 100);
measure('ConversationManager.getConversation()', (i) =>
  conv.getConversation(`bench-${i % 100}`)
, 10000);
measure('ConversationManager.listConversations()', () => conv.listConversations(), 1000);
measure('ConversationManager.getConversationsByPhone()', () =>
  conv.getConversationsByPhone('5492645555')
, 1000);

// 7. ConversationMemory
console.log('\n=== CONVERSATION MEMORY ===');
const mem = new ConversationMemory();
measure('ConversationMemory.remember()', (i) =>
  mem.remember('bench', `key${i}`, `value${i}`)
, 1000);
measure('ConversationMemory.recall()', (i) =>
  mem.recall('bench', `key${i % 1000}`)
, 10000);
measure('ConversationMemory.forget()', (i) =>
  mem.forget('bench', `key${i % 1000}`)
, 1000);

// 8. WhatsApp channel
console.log('\n=== WHATSAPP CHANNEL ===');
const channel = new MetaWhatsAppChannel({
  token: 'bench-token',
  phoneNumberId: 'bench-pnid',
  timeout: 5000,
});
measure('MetaWhatsAppChannel.normalizePhone()', (i) =>
  channel._MetaWhatsAppChannel_normalizePhone?.('5492645555') ||
  channel.getRequestTimestamps() || 0
, 10000);

// 9. Webhook parser
console.log('\n=== WEBHOOK PARSER ===');
const parser = new MessageParser();
const samplePayload = {
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        messages: [{ id: 'msg-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Hola' } }],
        contacts: [{ profile: { name: 'Test' } }],
      },
    }],
  }],
};
measure('MessageParser.parse()', () => parser.parse(samplePayload), 10000);

// 10. Webhook validator
console.log('\n=== WEBHOOK VALIDATOR ===');
const validator = new WebhookValidator({ verifyToken: 'test' });
measure('WebhookValidator.generateChallenge()', () =>
  validator.generateChallenge('subscribe', 'test', '123'), 10000);

console.log('\n=== BENCHMARK COMPLETE ===');
