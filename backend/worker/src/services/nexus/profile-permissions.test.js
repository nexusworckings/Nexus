import { describe, it, expect, vi } from 'vitest';
import { NexusAIEngine } from './nexus-ai-engine.js';
import { ProfileManager } from './profile-manager.js';

describe('Profile Permissions Integration', () => {
  function createEngine(profileOverrides) {
    const pm = new ProfileManager();
    if (profileOverrides) {
      for (const [id, config] of Object.entries(profileOverrides)) {
        if (pm.exists(id)) {
          const existing = pm.get(id);
          Object.assign(existing, config);
        } else {
          pm.register({ id, ...config });
        }
      }
    }
    return new NexusAIEngine({
      chatFn: vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'ok' })),
      profileManager: pm,
    });
  }

  it('customer cannot modify data', async () => {
    const engine = createEngine();
    const profile = engine.profileManager.get('customer');
    expect(profile.allowedTools).not.toContain('updateRepairStatus');
    expect(profile.permissions.canModify).toBe(false);
  });

  it('admin can modify data', async () => {
    const engine = createEngine();
    const profile = engine.profileManager.get('admin');
    expect(profile.allowedTools).toContain('updateRepairStatus');
    expect(profile.permissions.canModify).toBe(true);
  });

  it('interview can create entities', async () => {
    const engine = createEngine();
    const profile = engine.profileManager.get('interview');
    expect(profile.allowedTools).toContain('createRepair');
    expect(profile.allowedTools).toContain('createBudget');
    expect(profile.allowedTools).toContain('createPrintOrder');
    expect(profile.permissions.canCreate).toBe(true);
    expect(profile.permissions.canModify).toBe(false);
  });

  it('admin profile has all admin tools', async () => {
    const engine = createEngine();
    const profile = engine.profileManager.get('admin');
    const adminTools = ['queryTable', 'updateSingle', 'updateAll', 'findAndUpdate', 'createRecord', 'deleteRecord'];
    for (const tool of adminTools) {
      expect(profile.allowedTools).toContain(tool);
    }
  });

  it('customer profile has search-only tools', async () => {
    const engine = createEngine();
    const profile = engine.profileManager.get('customer');
    const searchTools = ['searchClient', 'searchRepair', 'searchBudget', 'searchPrintOrder', 'getConversation', 'searchNotifications', 'searchPrice'];
    for (const tool of searchTools) {
      expect(profile.allowedTools).toContain(tool);
    }
    const modifyTools = ['updateRepairStatus', 'updateBudgetStatus', 'updatePrintOrderStatus', 'createBudget', 'createRepair', 'createClient'];
    for (const tool of modifyTools) {
      expect(profile.allowedTools).not.toContain(tool);
    }
  });

  it('blocks tool not in profile allowedTools', async () => {
    const engine = createEngine();
    engine.toolRegistry.register({
      name: 'dangerousTool',
      execute: async () => 'deleted everything',
    });
    const profile = engine.profileManager.get('customer');

    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'dangerousTool', params: {} }],
      explanation: '',
    }));
    const engine2 = new NexusAIEngine({
      chatFn,
      profileManager: engine.profileManager,
      toolRegistry: engine.toolRegistry,
      contextManager: engine.contextManager,
    });

    const result = await engine2.process('do dangerous thing');
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('not allowed');
  });

  it('custom profile with restricted tools', async () => {
    const engine = createEngine();
    engine.profileManager.register({
      id: 'readonly',
      allowedTools: ['searchClient'],
      temperature: 0.5,
      maxIterations: 3,
      permissions: { canModify: false },
    });
    const profile = engine.profileManager.get('readonly');
    expect(profile.allowedTools).toEqual(['searchClient']);
    expect(profile.temperature).toBe(0.5);
    expect(profile.maxIterations).toBe(3);
  });

  it('profile system prompts are different', async () => {
    const engine = createEngine();
    const customerPrompt = engine.profileManager.get('customer').systemPrompt;
    const adminPrompt = engine.profileManager.get('admin').systemPrompt;
    const interviewPrompt = engine.profileManager.get('interview').systemPrompt;
    expect(customerPrompt).not.toBe(adminPrompt);
    expect(adminPrompt).not.toBe(interviewPrompt);
    expect(interviewPrompt).not.toBe(customerPrompt);
  });

  it('allows custom profile to be added', async () => {
    const engine = createEngine();
    engine.profileManager.register({
      id: 'operator',
      systemPrompt: 'You are an operator',
      allowedTools: ['searchClient', 'updateRepairStatus'],
      permissions: { canModify: true },
    });
    expect(engine.profileManager.exists('operator')).toBe(true);
    const result = await engine.process('test', { profile: 'operator' });
    expect(result).toBeDefined();
  });

  it('returns error for non-existent profile', async () => {
    const engine = createEngine();
    const result = await engine.process('test', { profile: 'ghost' });
    expect(result.type).toBe('error');
    expect(result.error).toContain('not found');
  });
});
