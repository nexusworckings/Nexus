import { describe, it, expect, vi } from 'vitest';
import { NexusAIEngine } from './nexus-ai-engine.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { ProfileManager } from './profile-manager.js';
import { ContextManager } from './context-manager.js';
import { PlanningEngine } from './planning-engine.js';
import { MetricsCollector } from './observability.js';
import { ChatRuntime } from './chat-runtime.js';

describe('Full Flow Integration', () => {
  it('end-to-end: customer chat flow', async () => {
    const chatFn = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: '¡Hola! ¿En qué puedo ayudarte?' }))
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: 'Tenemos reparación de celulares y notebooks.' }));

    const registry = new ToolRegistry();
    const metrics = new MetricsCollector();
    const executor = new ToolExecutor({ toolRegistry: registry, metricsCollector: metrics });
    const pm = new ProfileManager();
    const cm = new ContextManager();
    const pe = new PlanningEngine({ chatFn });

    const engine = new NexusAIEngine({
      toolRegistry: registry, toolExecutor: executor,
      profileManager: pm, contextManager: cm,
      planningEngine: pe, chatFn,
      metricsCollector: metrics,
    });

    const router = {
      classify: vi.fn().mockReturnValue({ type: 'none' }),
      hasActiveInterview: vi.fn().mockResolvedValue(false),
      answerMessage: vi.fn().mockResolvedValue({
        sessionId: null,
        question: null,
        interviewComplete: false,
        saved: false,
        validationError: null,
      }),
    };
    const runtime = new ChatRuntime({ engine, interviewRouter: router });

    const res1 = await runtime.handleMessage({ message: 'Hola', sessionId: 'full-flow' });
    expect(res1.type).toBe('chat');
    expect(res1.message).toContain('Hola');

    const res2 = await runtime.handleMessage({ message: 'Que servicios tienen?', sessionId: 'full-flow' });
    expect(res2.type).toBe('chat');

    const session = cm.getSession('full-flow');
    expect(session.conversationHistory.length).toBeGreaterThan(2);

    const summary = metrics.summary();
    expect(summary.totalCalls).toBeGreaterThanOrEqual(2);
  });

  it('end-to-end: admin action flow', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'queryTable', params: { table: 'products' } }],
      explanation: 'Consultando productos',
    }));
    const registry = new ToolRegistry();
    registry.register({
      name: 'queryTable',
      description: 'Query table',
      inputSchema: { table: { type: 'string', required: true } },
      execute: async () => [{ id: 1, name: 'Producto A', price: 10000 }],
    });
    const metrics = new MetricsCollector();
    const executor = new ToolExecutor({ toolRegistry: registry, metricsCollector: metrics });
    const pm = new ProfileManager();
    const cm = new ContextManager();
    const pe = new PlanningEngine({ chatFn });

    const engine = new NexusAIEngine({
      toolRegistry: registry, toolExecutor: executor,
      profileManager: pm, contextManager: cm,
      planningEngine: pe, chatFn,
      metricsCollector: metrics,
    });

    const result = await engine.process('Que productos tenemos?', {
      profile: 'admin',
      sessionId: 'admin-flow',
    });
    expect(result.type).toBe('execution');
    expect(result.results[0].success).toBe(true);
  });

  it('end-to-end: multi-tool admin flow', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [
        { tool: 'queryTable', params: { table: 'products' } },
        { tool: 'updateSingle', params: { table: 'products', id: 1, changes: { price: 15000 } } },
      ],
      explanation: 'Actualizando precio del producto',
    }));
    const registry = new ToolRegistry();
    registry.register({
      name: 'queryTable', description: 'Query',
      inputSchema: { table: { type: 'string', required: true } },
      execute: async () => [{ id: 1, name: 'Teclado', price: 10000 }],
    });
    registry.register({
      name: 'updateSingle', description: 'Update',
      inputSchema: { table: { type: 'string', required: true }, id: { type: 'number' }, changes: { type: 'object' } },
      execute: async (p) => ({ id: p.id, updated: true }),
    });
    const pm = new ProfileManager();
    const cm = new ContextManager();
    const pe = new PlanningEngine({ chatFn });

    const engine = new NexusAIEngine({
      toolRegistry: registry, profileManager: pm, contextManager: cm,
      planningEngine: pe, chatFn,
    });

    const result = await engine.process('Cambiar precio del teclado a 15000', {
      profile: 'admin',
      sessionId: 'admin-multi',
    });
    expect(result.plan).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
  });

  it('end-to-end: error recovery across sessions', async () => {
    let callCount = 0;
    const chatFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) throw new Error('Service unavailable');
      return JSON.stringify({ plan: [], explanation: '¡Listo! Todo funcionando.' });
    });

    const engine = new NexusAIEngine({ chatFn });

    const r1 = await engine.process('test', { sessionId: 'err-recovery' });
    expect(r1.type).toBe('conversation');
    expect(r1.message).toContain('Planning error');

    const r2 = await engine.process('test', { sessionId: 'err-recovery' });
    expect(r2.type).toBe('conversation');
    expect(r2.message).toContain('Planning error');

    const r3 = await engine.process('test', { sessionId: 'err-recovery' });
    expect(r3.type).toBe('conversation');

    expect(callCount).toBe(3);
  });

  it('end-to-end: profile scoping prevents unauthorized actions', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'deleteRecord', params: { table: 'products', id: 1 } }],
      explanation: 'Deleting',
    }));
    const registry = new ToolRegistry();
    registry.register({
      name: 'deleteRecord', description: 'Delete',
      inputSchema: { table: { type: 'string', required: true }, id: { type: 'number' } },
      execute: async () => ({ deleted: true }),
    });

    const engine = new NexusAIEngine({
      toolRegistry: registry, chatFn,
      profileManager: new ProfileManager(),
    });

    const result = await engine.process('delete product 1', { profile: 'customer' });
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('not allowed');
  });
});
