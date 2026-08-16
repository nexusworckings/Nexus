import { describe, it, expect, vi } from 'vitest';
import { NexusAIEngine } from './nexus-ai-engine.js';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { ProfileManager } from './profile-manager.js';
import { ContextManager } from './context-manager.js';
import { PlanningEngine } from './planning-engine.js';
import { MetricsCollector } from './observability.js';
import { createSearchPriceTool } from './tools/index.js';
import { PriceService } from '../business/price-service.js';

const SERVICES = [{ id: 10, name: 'Cambio de pantalla' }];

function makeEngine({ chatFn, prices = [], services = SERVICES }) {
  const registry = new ToolRegistry();
  const metrics = new MetricsCollector();
  const executor = new ToolExecutor({ toolRegistry: registry, metricsCollector: metrics });
  const pm = new ProfileManager();
  const cm = new ContextManager();
  const pe = new PlanningEngine({ chatFn });

  const priceService = new PriceService({
    queryFn: vi.fn(async (table) => {
      if (table === 'prices') return prices;
      if (table === 'services') return services;
      return [];
    }),
  });

  registry.register(createSearchPriceTool({ priceService }));
  pm.get('customer').allowedTools.push('searchPrice');

  const engine = new NexusAIEngine({
    toolRegistry: registry,
    toolExecutor: executor,
    profileManager: pm,
    contextManager: cm,
    planningEngine: pe,
    chatFn,
    metricsCollector: metrics,
  });

  return { engine, priceService };
}

describe('searchPrice end-to-end flow', () => {
  it('PlanningEngine selects searchPrice and tool returns structured price data', async () => {
    const prices = [{ id: 1, service_id: 10, label: 'Motorola G32', amount: 42000, currency: 'ARS' }];
    const chatFn = vi.fn().mockImplementation(async (prompt) => {
      expect(prompt).toContain('searchPrice');
      return JSON.stringify({
        plan: [{ tool: 'searchPrice', params: { query: 'pantalla motorola g32' } }],
        explanation: 'Déjame buscar el precio.',
      });
    });
    const { engine } = makeEngine({ chatFn, prices });

    const result = await engine.process('¿Cuánto cuesta cambiar la pantalla del Motorola G32?', { sessionId: 'price-flow' });

    expect(result.type).toBe('execution');
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual([{
      service: 'Cambio de pantalla',
      label: 'Motorola G32',
      amount: 42000,
      currency: 'ARS',
    }]);
  });

  it('returns multiple structured options ordered by relevance', async () => {
    const prices = [
      { id: 1, service_id: 10, label: 'Estándar', amount: 25000, currency: 'ARS' },
      { id: 2, service_id: 10, label: 'Premium', amount: 35000, currency: 'ARS' },
    ];
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'searchPrice', params: { query: 'pantalla' } }],
      explanation: 'Encontré estas opciones.',
    }));
    const { engine } = makeEngine({ chatFn, prices });

    const result = await engine.process('¿Cuánto cuesta la pantalla?', { sessionId: 'multi-price' });

    expect(result.results[0].data.results).toHaveLength(2);
    expect(result.results[0].data.results[0]).toEqual({ service: 'Cambio de pantalla', label: 'Estándar', amount: 25000, currency: 'ARS' });
    expect(result.results[0].data.results[1]).toEqual({ service: 'Cambio de pantalla', label: 'Premium', amount: 35000, currency: 'ARS' });
  });

  it('returns empty results when nothing matches (never invents)', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'searchPrice', params: { query: 'pantalla motorola g32' } }],
      explanation: 'No encontré el precio.',
    }));
    const { engine } = makeEngine({ chatFn, prices: [] });

    const result = await engine.process('¿Cuánto cuesta la pantalla?', { sessionId: 'none-price' });

    expect(result.results[0].success).toBe(true);
    expect(result.results[0].data.results).toEqual([]);
  });

  it('customer profile allows searchPrice but not admin tools', () => {
    const pm = new ProfileManager();
    const profile = pm.get('customer');
    expect(profile.allowedTools).toContain('searchPrice');
    expect(profile.allowedTools).not.toContain('queryTable');
    expect(profile.allowedTools).not.toContain('deleteRecord');
    expect(profile.allowedTools).not.toContain('updateSingle');
  });

  it('rejects searchPrice when tool not in profile', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'searchPrice', params: { query: 'pantalla' } }],
      explanation: 'x',
    }));
    const registry = new ToolRegistry();
    const pm = new ProfileManager();
    pm.register({
      id: 'limited',
      systemPrompt: 'limited',
      allowedTools: ['searchClient'],
      permissions: { canModify: false, canCreate: false, canDelete: false },
    });
    const engine = new NexusAIEngine({
      toolRegistry: registry,
      profileManager: pm,
      chatFn,
    });
    registry.register(createSearchPriceTool({ priceService: { search: vi.fn() } }));

    const result = await engine.process('precio pantalla', { profile: 'limited', sessionId: 'blocked-price' });

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('not allowed');
  });
});
