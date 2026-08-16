import { describe, it, expect, vi } from 'vitest';
import { NexusAIEngine } from './nexus-ai-engine.js';
import { registerInterviewTools } from './tools/interview-tools.js';

describe('Interview Integration via NexusAIEngine', () => {
  it('interview tools registered in engine', () => {
    const engine = new NexusAIEngine({ chatFn: async () => '{}' });
    registerInterviewTools(engine.toolRegistry, {});
    expect(engine.toolRegistry.exists('questionGenerator')).toBe(true);
    expect(engine.toolRegistry.exists('interpreter')).toBe(true);
    expect(engine.toolRegistry.exists('interviewController')).toBe(true);
  });

  it('interview profile allows interview tools', () => {
    const engine = new NexusAIEngine({ chatFn: async () => '{}' });
    const profile = engine.profileManager.get('interview');
    expect(profile.allowedTools).toContain('questionGenerator');
    expect(profile.allowedTools).toContain('interpreter');
    expect(profile.allowedTools).toContain('interviewController');
    expect(profile.allowedTools).toContain('createClient');
    expect(profile.allowedTools).toContain('createRepair');
  });

  it('questionGenerator tool works with engine', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'questionGenerator', params: { schema: { fields: [{ id: 'name', question: 'Your name?' }] }, answers: {} } }],
      explanation: 'Generate question',
    }));
    const engine = new NexusAIEngine({ chatFn });
    registerInterviewTools(engine.toolRegistry, {});
    engine.profileManager.get('customer').allowedTools.push('questionGenerator');

    const result = await engine.process('start interview', { sessionId: 'interview-q' });
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.question).toBeDefined();
  });

  it('interviewController status tool works', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'interviewController', params: { action: 'status', data: {} } }],
      explanation: 'Check status',
    }));
    const engine = new NexusAIEngine({ chatFn });
    registerInterviewTools(engine.toolRegistry, {});
    engine.profileManager.get('customer').allowedTools.push('interviewController');

    const result = await engine.process('check status', { sessionId: 'interview-status' });
    expect(result.results[0].success).toBe(true);
  });

  it('interviewController summary tool works', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'interviewController', params: { action: 'summary', data: { name: 'Juan', device: 'Laptop' } } }],
      explanation: 'Summary',
    }));
    const engine = new NexusAIEngine({ chatFn });
    registerInterviewTools(engine.toolRegistry, {});
    engine.profileManager.get('customer').allowedTools.push('interviewController');

    const result = await engine.process('summarize', { sessionId: 'interview-summary' });
    expect(result.results[0].data.summary.name).toBe('Juan');
  });

  it('interpreter tool works', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'interpreter', params: { answer: 'Juan', field: 'name' } }],
      explanation: 'Interpret',
    }));
    const engine = new NexusAIEngine({ chatFn });
    registerInterviewTools(engine.toolRegistry, {});
    engine.profileManager.get('customer').allowedTools.push('interpreter');

    const result = await engine.process('my name is Juan', { sessionId: 'interview-interp' });
    expect(result.results[0].data.interpreted).toBe('Juan');
  });

  it('engine with interview profile creates sessions correctly', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'Interviewing' }));
    const engine = new NexusAIEngine({ chatFn });
    await engine.process('quiero arreglar mi celular', {
      profile: 'interview',
      sessionId: 'interview-session',
      clientId: 'c-1',
    });
    const session = engine.contextManager.getSession('interview-session');
    expect(session.profile).toBe('interview');
    expect(session.clientId).toBe('c-1');
  });
});
