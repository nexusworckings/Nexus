import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { registerInterviewTools } from './interview-tools.js';

describe('registerInterviewTools', () => {
  it('registers interview tools', () => {
    const registry = new ToolRegistry();
    registerInterviewTools(registry, {});
    expect(registry.count()).toBe(3);
    expect(registry.exists('questionGenerator')).toBe(true);
    expect(registry.exists('interpreter')).toBe(true);
    expect(registry.exists('interviewController')).toBe(true);
  });

  it('questionGenerator returns default without deps', async () => {
    const registry = new ToolRegistry();
    registerInterviewTools(registry, {});
    const tool = registry.get('questionGenerator');
    const result = await tool.execute({ schema: {}, answers: {} });
    expect(result.question).toBe('What is your name?');
    expect(result.field).toBe('name');
  });

  it('questionGenerator uses deps when available', async () => {
    const questionGenerator = { generate: vi.fn().mockResolvedValue({ question: 'How old are you?', field: 'age' }) };
    const registry = new ToolRegistry();
    registerInterviewTools(registry, { questionGenerator });
    const tool = registry.get('questionGenerator');
    const result = await tool.execute({ schema: { fields: [] }, answers: {} });
    expect(questionGenerator.generate).toHaveBeenCalledWith({ fields: [] }, {});
    expect(result.question).toBe('How old are you?');
  });

  it('interpreter returns default without deps', async () => {
    const registry = new ToolRegistry();
    registerInterviewTools(registry, {});
    const tool = registry.get('interpreter');
    const result = await tool.execute({ answer: 'Juan', question: 'Name?', field: 'name' });
    expect(result.interpreted).toBe('Juan');
    expect(result.field).toBe('name');
  });

  it('interpreter uses deps when available', async () => {
    const interpreter = { interpret: vi.fn().mockResolvedValue({ interpreted: 'Pedro', field: 'name', confidence: 0.9 }) };
    const registry = new ToolRegistry();
    registerInterviewTools(registry, { interpreter });
    const tool = registry.get('interpreter');
    const result = await tool.execute({ answer: 'Pedro' });
    expect(interpreter.interpret).toHaveBeenCalledWith('Pedro', { question: undefined, field: undefined });
    expect(result.interpreted).toBe('Pedro');
  });

  it('interviewController status works', async () => {
    const registry = new ToolRegistry();
    registerInterviewTools(registry, {});
    const tool = registry.get('interviewController');
    const result = await tool.execute({ action: 'status', data: {} });
    expect(result.complete).toBe(false);
  });

  it('interviewController summary works', async () => {
    const registry = new ToolRegistry();
    registerInterviewTools(registry, {});
    const tool = registry.get('interviewController');
    const result = await tool.execute({ action: 'summary', data: { name: 'Juan' } });
    expect(result.summary.name).toBe('Juan');
  });

  it('interviewController uses deps when available', async () => {
    const interviewController = { next: vi.fn().mockResolvedValue({ question: 'Next?', complete: false }) };
    const registry = new ToolRegistry();
    registerInterviewTools(registry, { interviewController });
    const tool = registry.get('interviewController');
    const result = await tool.execute({ action: 'next', data: { sessionId: 's-1' } });
    expect(interviewController.next).toHaveBeenCalledWith('s-1');
  });

  it('questionGenerator requires schema and answers params', async () => {
    const registry = new ToolRegistry();
    registerInterviewTools(registry, {});
    const tool = registry.get('questionGenerator');
    const result = await tool.execute({ schema: { type: 'object' }, answers: { name: 'Juan' } });
    expect(result.field).toBeDefined();
  });
});
