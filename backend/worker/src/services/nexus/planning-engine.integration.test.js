import { describe, it, expect, vi } from 'vitest';
import { PlanningEngine } from './planning-engine.js';
import { ToolRegistry } from './tool-registry.js';

describe('PlanningEngine Integration', () => {
  it('generates plan for search + message flow', async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt).toContain('searchClient');
      expect(prompt).toContain('sendWhatsApp');
      return JSON.stringify({
        plan: [
          { tool: 'searchClient', params: { query: 'Juan' } },
          { tool: 'sendWhatsApp', params: { phone: '264555', message: 'Hola Juan' } },
        ],
        explanation: 'Search and message',
      });
    });
    const engine = new PlanningEngine({ chatFn });
    const tools = [
      { name: 'searchClient', description: 'Search clients', inputSchema: { query: { type: 'string', required: true } } },
      { name: 'sendWhatsApp', description: 'Send WhatsApp', inputSchema: { phone: { type: 'string', required: true }, message: { type: 'string', required: true } } },
    ];
    const result = await engine.createPlan('Mandale un WhatsApp a Juan', { availableTools: tools });
    expect(result.plan).toHaveLength(2);
    expect(result.plan[0].tool).toBe('searchClient');
  });

  it('generates plan for admin operations', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [
        { tool: 'queryTable', params: { table: 'products' } },
        { tool: 'updateSingle', params: { table: 'products', id: 1, changes: { price: 15000 } } },
      ],
      explanation: 'Update product price',
    }));
    const engine = new PlanningEngine({ chatFn });
    const tools = [
      { name: 'queryTable', description: 'Query table', inputSchema: { table: { type: 'string', required: true } } },
      { name: 'updateSingle', description: 'Update single record', inputSchema: { table: { type: 'string', required: true }, id: { type: 'number', required: true }, changes: { type: 'object', required: true } } },
    ];
    const result = await engine.createPlan('Cambiar precio del producto 1 a 15000', { availableTools: tools });
    expect(result.plan[1].params.id).toBe(1);
  });

  it('generates conversational response when no action needed', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [],
      explanation: '¡Hola! ¿En qué puedo ayudarte hoy?',
    }));
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan('Hola', { availableTools: [] });
    expect(result.plan).toHaveLength(0);
    expect(result.explanation).toContain('Hola');
  });

  it('handles plan with single tool', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'searchClient', params: { query: 'test' } }],
      explanation: 'Searching',
    }));
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan('test', {
      availableTools: [{ name: 'searchClient', description: 'Search' }],
    });
    expect(result.plan).toHaveLength(1);
  });

  it('includes conversation context when creating plan', async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt).toContain('workingMemory');
      expect(prompt).toContain('session');
      return JSON.stringify({ plan: [], explanation: 'ok' });
    });
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan('test', {
      availableTools: [],
      systemPrompt: 'Custom system',
      clientId: 'c-1',
      sessionId: 's-1',
      workingMemory: { device: 'Laptop' },
      conversationHistory: [{ role: 'user', content: 'hi' }],
    });
  });

  it('returns empty plan on malformed AI response', async () => {
    const chatFn = vi.fn().mockResolvedValue('not json at all');
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan('test');
    expect(result.plan).toEqual([]);
  });

  it('extracts JSON from mixed response', async () => {
    const chatFn = vi.fn().mockResolvedValue('Here is the plan: { "plan": [{ "tool": "test", "params": {} }], "explanation": "done" }');
    const engine = new PlanningEngine({ chatFn });
    const result = await engine.createPlan('test');
    expect(result.plan).toHaveLength(1);
  });

  it('tool descriptions formatted correctly', async () => {
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt).toContain('myTool');
      expect(prompt).toContain('My custom tool');
      return JSON.stringify({ plan: [], explanation: 'ok' });
    });
    const engine = new PlanningEngine({ chatFn });
    await engine.createPlan('test', {
      availableTools: [{ name: 'myTool', description: 'My custom tool', inputSchema: { x: { type: 'string', required: true } } }],
    });
  });
});
