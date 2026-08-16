import { describe, it, expect, vi } from 'vitest';
import { NexusAIEngine } from './nexus-ai-engine.js';

describe('NexusAIEngine Error Scenarios', () => {
  it('handles planning failure gracefully', async () => {
    const engine = new NexusAIEngine({
      chatFn: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    });
    const result = await engine.process('test');
    expect(result.type).toBe('conversation');
    expect(result.message).toContain('Planning error');
  });

  it('handles tool execution failure gracefully', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'failTool', params: {} }],
      explanation: '',
    }));
    const engine = new NexusAIEngine({ chatFn });
    engine.toolRegistry.register({
      name: 'failTool',
      execute: async () => { throw new Error('Tool crashed'); },
    });
    engine.profileManager.get('customer').allowedTools.push('failTool');

    const result = await engine.process('do it');
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toBe('Tool crashed');
  });

  it('handles missing chatFn', () => {
    expect(() => new NexusAIEngine()).toThrow('chatFn is required');
  });

  it('handles invalid profile', async () => {
    const engine = new NexusAIEngine({ chatFn: async () => '{}' });
    const result = await engine.process('test', { profile: 'nonexistent' });
    expect(result.type).toBe('error');
    expect(result.error).toContain('not found');
  });

  it('handles plan with no tools while also providing conversational response', async () => {
    const engine = new NexusAIEngine({
      chatFn: vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Sure!' })),
    });
    const result = await engine.process('How are you?');
    expect(result.type).toBe('conversation');
    expect(result.message).toBe('Sure!');
  });

  it('recovers after error on subsequent call', async () => {
    const chatFn = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce(JSON.stringify({ plan: [], explanation: 'Recovered!' }));

    const engine = new NexusAIEngine({ chatFn });
    const result1 = await engine.process('first', { sessionId: 'recover' });
    expect(result1.type).toBe('conversation');
    expect(result1.message).toContain('Planning error');

    const result2 = await engine.process('second', { sessionId: 'recover' });
    expect(result2.type).toBe('conversation');
    expect(result2.message).toBe('Recovered!');
  });

  it('tracks engine calls in metrics even on failure', async () => {
    const chatFn = vi.fn().mockRejectedValue(new Error('tracked error'));
    const engine = new NexusAIEngine({ chatFn });
    await engine.process('test');
    const metrics = engine.metrics.snapshot();
    expect(metrics.engine.calls).toBeGreaterThanOrEqual(1);
  });

  it('engine handles empty plan from planning engine', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Just chatting' }));
    const engine = new NexusAIEngine({ chatFn });
    const result = await engine.process('hello');
    expect(result.type).toBe('conversation');
  });

  it('handles null input', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'ok' }));
    const engine = new NexusAIEngine({ chatFn });
    const result = await engine.process(null);
    expect(result).toBeDefined();
    expect(result.type).toBe('conversation');
  });

  it('handles undefined options', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'ok' }));
    const engine = new NexusAIEngine({ chatFn });
    const result = await engine.process('test', undefined);
    expect(result.type).toBe('conversation');
  });
});
