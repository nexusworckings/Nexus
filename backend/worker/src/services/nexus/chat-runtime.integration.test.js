import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRuntime } from './chat-runtime.js';
import { NexusAIEngine } from './nexus-ai-engine.js';

function createMockEngine() {
  const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Hello!' }));
  return new NexusAIEngine({ chatFn });
}

function createMockRouter() {
  return {
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
}

describe('ChatRuntime → NexusAIEngine Integration', () => {
  let engine;
  let router;

  beforeEach(() => {
    engine = createMockEngine();
    router = createMockRouter();
  });

  it('throws without engine', () => {
    expect(() => new ChatRuntime({ interviewRouter: router })).toThrow('engine is required');
  });

  it('throws without interviewRouter', () => {
    expect(() => new ChatRuntime({ engine })).toThrow('interviewRouter is required');
  });

  it('returns error for empty message', async () => {
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    const result = await runtime.handleMessage({ message: '' });
    expect(result.type).toBe('error');
  });

  it('routes to chat for customer messages', async () => {
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    const result = await runtime.handleMessage({ message: 'Hola' });
    expect(result.type).toBe('chat');
    expect(result.message).toBe('Hello!');
  });

  it('uses customer profile by default', async () => {
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    await runtime.handleMessage({ message: 'test' });
    expect(engine.contextManager.count()).toBeGreaterThan(0);
  });

  it('preserves sessionId across messages', async () => {
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    await runtime.handleMessage({ message: 'First', sessionId: 'test-session' });
    await runtime.handleMessage({ message: 'Second', sessionId: 'test-session' });
    const session = engine.contextManager.getSession('test-session');
    expect(session.conversationHistory).toHaveLength(4);
  });

  it('switches to interview profile when session exists', async () => {
    engine.contextManager.createSession('interview-session', { profile: 'interview' });
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    const processSpy = vi.spyOn(engine, 'process');
    await runtime.handleMessage({ message: 'test', sessionId: 'interview-session' });
    expect(processSpy).toHaveBeenCalledWith('test', expect.objectContaining({ profile: 'interview' }));
  });

  it('handles engine error gracefully', async () => {
    const brokenEngine = new NexusAIEngine({
      chatFn: vi.fn().mockRejectedValue(new Error('API error')),
    });
    const runtime = new ChatRuntime({ engine: brokenEngine, interviewRouter: router });
    const result = await runtime.handleMessage({ message: 'test' });
    expect(result.type).toBe('chat');
  });

  it('exposes engine getter', () => {
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    expect(runtime.engine).toBe(engine);
  });

  it('formats completion response from interview', async () => {
    const engine = new NexusAIEngine({
      chatFn: vi.fn().mockResolvedValue(JSON.stringify({
        plan: [{ tool: 'createRepair', params: { clientId: 'c1', device: 'Laptop' } }],
        explanation: 'Creating repair',
      })),
    });
    engine.toolRegistry.register({
      name: 'createRepair',
      description: 'Create a repair',
      inputSchema: { clientId: { type: 'string', required: true } },
      execute: async () => ({ id: 'r1', complete: true }),
    });
    engine.profileManager.get('customer').allowedTools.push('createRepair');

    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    const result = await runtime.handleMessage({ message: 'create repair', sessionId: 'flow-session' });
    expect(result.type).toBe('completed');
  });

  it('non-interview session without stored context uses customer', async () => {
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    const processSpy = vi.spyOn(engine, 'process');
    await runtime.handleMessage({ message: 'test', sessionId: 'new-session' });
    expect(processSpy).toHaveBeenCalledWith('test', expect.objectContaining({ profile: 'customer' }));
  });

  it('passes message to engine.process', async () => {
    const runtime = new ChatRuntime({ engine, interviewRouter: router });
    const processSpy = vi.spyOn(engine, 'process');
    await runtime.handleMessage({ message: 'specific message', sessionId: 'specific-session' });
    expect(processSpy).toHaveBeenCalledWith('specific message', expect.any(Object));
  });
});
