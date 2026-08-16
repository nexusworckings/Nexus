import { describe, it, expect, vi } from 'vitest';
import { NexusAIEngine } from './nexus-ai-engine.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { ProfileManager } from './profile-manager.js';
import { ContextManager } from './context-manager.js';

describe('NexusAIEngine Integration - Multi-tool flows', () => {
  function createEngine(overrides = {}) {
    const chatFn = overrides.chatFn || vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'ok' }));
    return new NexusAIEngine({ chatFn, ...overrides });
  }

  function registerSearchTool(engine) {
    engine.toolRegistry.register({
      name: 'searchClient',
      description: 'Search clients',
      inputSchema: { query: { type: 'string', required: true } },
      execute: async (p) => [{ id: 1, name: p.query }],
    });
    engine.profileManager.get('customer').allowedTools.push('searchClient');
  }

  it('executes multi-tool plan from search to WhatsApp', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [
        { tool: 'searchClient', params: { query: 'Juan' } },
        { tool: 'sendWhatsApp', params: { phone: '264555', message: 'Hola Juan' } },
      ],
      explanation: 'Search and message Juan',
    }));
    const engine = createEngine({ chatFn });
    engine.toolRegistry.register({
      name: 'searchClient', description: 'Search',
      inputSchema: { query: { type: 'string', required: true } },
      execute: async () => [{ id: 1, name: 'Juan' }],
    });
    engine.toolRegistry.register({
      name: 'sendWhatsApp', description: 'Send WhatsApp',
      inputSchema: { phone: { type: 'string', required: true }, message: { type: 'string', required: true } },
      execute: async () => ({ sent: true, messageId: 'msg-1' }),
    });
    engine.profileManager.get('customer').allowedTools.push('searchClient', 'sendWhatsApp');

    const result = await engine.process('Mandale un WhatsApp a Juan', { sessionId: 'multi-tool' });
    expect(result.type).toBe('execution');
    expect(result.plan).toHaveLength(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
  });

  it('respects tool order in plan', async () => {
    const executionOrder = [];
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [
        { tool: 'step1', params: {} },
        { tool: 'step2', params: {} },
      ],
      explanation: 'Two steps',
    }));
    const engine = createEngine({ chatFn });
    engine.toolRegistry.register({
      name: 'step1', execute: async () => { executionOrder.push('step1'); },
    });
    engine.toolRegistry.register({
      name: 'step2', execute: async () => { executionOrder.push('step2'); },
    });
    engine.profileManager.get('customer').allowedTools.push('step1', 'step2');

    await engine.process('do steps', { sessionId: 'order-test' });
    expect(executionOrder).toEqual(['step1', 'step2']);
  });

  it('stops execution on tool not allowed by profile', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [
        { tool: 'allowedTool', params: {} },
        { tool: 'restrictedTool', params: {} },
        { tool: 'allowedTool2', params: {} },
      ],
      explanation: 'test plan',
    }));
    const engine = createEngine({ chatFn });
    engine.toolRegistry.register({ name: 'allowedTool', execute: async () => 'ok' });
    engine.toolRegistry.register({ name: 'restrictedTool', execute: async () => 'secret' });
    engine.toolRegistry.register({ name: 'allowedTool2', execute: async () => 'ok2' });
    engine.profileManager.get('customer').allowedTools.push('allowedTool', 'allowedTool2');

    const result = await engine.process('test', { sessionId: 'profile-restrict' });
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toContain('not allowed');
    expect(result.results[2].success).toBe(true);
  });

  it('tracks tool results in context', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'trackTool', params: { x: 1 } }],
      explanation: '',
    }));
    const engine = createEngine({ chatFn });
    engine.toolRegistry.register({ name: 'trackTool', execute: async () => 'done' });
    engine.profileManager.get('customer').allowedTools.push('trackTool');

    await engine.process('test', { sessionId: 'tracking-session' });
    const session = engine.contextManager.getSession('tracking-session');
    expect(session.toolHistory).toHaveLength(1);
    expect(session.toolHistory[0].toolName).toBe('trackTool');
    expect(session.toolHistory[0].params).toEqual({ x: 1 });
  });

  it('reuses existing session context', async () => {
    const engine = createEngine();
    engine.contextManager.createSession('reuse-session', {
      clientId: 'c-123',
      repairId: 'r-456',
      workingMemory: { device: 'iPhone' },
    });
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      if (prompt.includes('c-123') && prompt.includes('iPhone')) {
        return JSON.stringify({ plan: [], explanation: 'Found context!' });
      }
      return JSON.stringify({ plan: [], explanation: 'No context' });
    });
    engine.chatFn = chatFn;
    engine.process = undefined;
    const reuseEngine = new NexusAIEngine({ chatFn, contextManager: engine.contextManager, toolRegistry: engine.toolRegistry });

    const result = await reuseEngine.process('check context', { sessionId: 'reuse-session' });
    expect(result.message).toBe('Found context!');
  });

  it('handles execution with data transformation pipeline', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [
        { tool: 'searchClient', params: { query: 'Maria' } },
        { tool: 'searchRepair', params: { clientId: 'c-99' } },
      ],
      explanation: 'Find repairs for Maria',
    }));
    const engine = createEngine({ chatFn });
    engine.toolRegistry.register({
      name: 'searchClient',
      execute: async (p) => [{ id: 'c-99', name: 'Maria' }],
    });
    engine.toolRegistry.register({
      name: 'searchRepair',
      execute: async (p) => [{ id: 'r-1', device: 'Laptop', status: 'completed' }],
    });
    engine.profileManager.get('customer').allowedTools.push('searchClient', 'searchRepair');

    const result = await engine.process('find repairs for Maria', { sessionId: 'pipeline' });
    expect(result.results[0].data[0].name).toBe('Maria');
    expect(result.results[1].data[0].status).toBe('completed');
  });

  it('planning error returns error type', async () => {
    const chatFn = vi.fn().mockRejectedValue(new Error('planning failed'));
    const engine = createEngine({ chatFn });
    const result = await engine.process('test', { sessionId: 'error-test' });
    expect(result.type).toBe('conversation');
  });

  it('returns working memory in execution response', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'testTool', params: {} }],
      explanation: '',
    }));
    const engine = createEngine({ chatFn });
    engine.toolRegistry.register({ name: 'testTool', execute: async () => 'ok' });
    engine.profileManager.get('customer').allowedTools.push('testTool');

    await engine.process('test', { sessionId: 'wm-session', workingMemory: { device: 'iPad' } });
    const session = engine.contextManager.getSession('wm-session');
    expect(session.workingMemory.device).toBe('iPad');
  });
});
