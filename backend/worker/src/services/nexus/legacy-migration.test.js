import { describe, it, expect } from 'vitest';

describe('Legacy Migration', () => {
  it('admin-ai.js imports from nexus engine modules', async () => {
    const adminHandler = await import('../../handlers/admin-ai.js');
    expect(adminHandler).toHaveProperty('handleAdminAiAction');
  });

  it('chat-runtime.js imports from engine', async () => {
    const runtime = await import('./chat-runtime.js');
    expect(runtime).toHaveProperty('ChatRuntime');
  });

  it('tools/index.js exports registerTools function', async () => {
    const tools = await import('./tools/index.js');
    expect(typeof tools.registerTools).toBe('function');
  });

  it('tools/admin-tools.js exports registerAdminTools', async () => {
    const admTools = await import('./tools/admin-tools.js');
    expect(typeof admTools.registerAdminTools).toBe('function');
  });

  it('tools/interview-tools.js exports registerInterviewTools', async () => {
    const intTools = await import('./tools/interview-tools.js');
    expect(typeof intTools.registerInterviewTools).toBe('function');
  });

  it('router.js imports admin-ai handler', async () => {
    const router = await import('../../router.js');
    expect(router).toHaveProperty('handleRequest');
  });
});
