import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { registerAdminTools } from './admin-tools.js';

function makeDeps(overrides = {}) {
  return {
    query: overrides.query || vi.fn().mockResolvedValue([]),
    update: overrides.update || vi.fn().mockResolvedValue(undefined),
    insert: overrides.insert || vi.fn().mockResolvedValue({ id: 'new-id' }),
    delete: overrides.delete || vi.fn().mockResolvedValue(undefined),
  };
}

describe('registerAdminTools', () => {
  it('registers all admin tools', () => {
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps());
    expect(registry.count()).toBe(6);
  });

  it('queryTable tool exists', () => {
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps());
    expect(registry.exists('queryTable')).toBe(true);
  });

  it('queryTable executes query with filters', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1, name: 'Test' }]);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ query }));
    const tool = registry.get('queryTable');
    const result = await tool.execute({ table: 'products', filters: { is_active: 'true' } });
    expect(query).toHaveBeenCalledWith('products', { eq: { is_active: 'true' } }, true);
    expect(result.results).toHaveLength(1);
  });

  it('queryTable passes limit parameter', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ query }));
    const tool = registry.get('queryTable');
    await tool.execute({ table: 'products', limit: 5 });
    expect(query).toHaveBeenCalledWith('products', { limit: '5' }, true);
  });

  it('updateSingle tool exists and updates', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ update }));
    const tool = registry.get('updateSingle');
    const result = await tool.execute({ table: 'products', id: 1, changes: { price: 100 } });
    expect(update).toHaveBeenCalledWith('products', 1, { price: 100 }, true);
    expect(result.updated).toBe(true);
  });

  it('updateAll with percentage operation', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1, price: 100 }]);
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ query, update }));
    const tool = registry.get('updateAll');
    const result = await tool.execute({
      table: 'products',
      changes: { price: { operation: 'percentage', value: 15 } },
    });
    expect(update).toHaveBeenCalledWith('products', 1, { price: 115 }, true);
    expect(result.count).toBe(1);
  });

  it('updateAll with multiply operation', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1, price: 50 }]);
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ query, update }));
    const tool = registry.get('updateAll');
    await tool.execute({
      table: 'products',
      changes: { price: { operation: 'multiply', value: 2 } },
    });
    expect(update).toHaveBeenCalledWith('products', 1, { price: 100 }, true);
  });

  it('updateAll with add operation', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1, price: 100 }]);
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ query, update }));
    const tool = registry.get('updateAll');
    await tool.execute({
      table: 'products',
      changes: { price: { operation: 'add', value: 20 } },
    });
    expect(update).toHaveBeenCalledWith('products', 1, { price: 120 }, true);
  });

  it('updateAll with subtract operation', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 1, price: 100 }]);
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ query, update }));
    const tool = registry.get('updateAll');
    await tool.execute({
      table: 'products',
      changes: { price: { operation: 'subtract', value: 15 } },
    });
    expect(update).toHaveBeenCalledWith('products', 1, { price: 85 }, true);
  });

  it('findAndUpdate tool exists and updates', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 2, name: 'Keyboard' }]);
    const update = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ query, update }));
    const tool = registry.get('findAndUpdate');
    const result = await tool.execute({
      table: 'products',
      match: { name: 'Keyboard' },
      changes: { price: 25000 },
    });
    expect(update).toHaveBeenCalledWith('products', 2, { price: 25000 }, true);
    expect(result.count).toBe(1);
  });

  it('createRecord tool exists and inserts', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'p-new' });
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ insert }));
    const tool = registry.get('createRecord');
    const result = await tool.execute({
      table: 'products',
      data: { name: 'Mouse', price: 15000, is_active: true },
    });
    expect(insert).toHaveBeenCalledWith('products', { name: 'Mouse', price: 15000, is_active: true }, true);
    expect(result.created).toBe(true);
  });

  it('createRecord filters empty values', async () => {
    const insert = vi.fn().mockResolvedValue({ id: 'x' });
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ insert }));
    const tool = registry.get('createRecord');
    await tool.execute({
      table: 'products',
      data: { name: 'Test', description: '', price: null },
    });
    const inserted = insert.mock.calls[0][1];
    expect(inserted.name).toBe('Test');
    expect(inserted.description).toBeUndefined();
    expect(inserted.price).toBeUndefined();
  });

  it('deleteRecord tool exists and deletes', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry();
    registerAdminTools(registry, makeDeps({ delete: del }));
    const tool = registry.get('deleteRecord');
    const result = await tool.execute({ table: 'products', id: 5 });
    expect(del).toHaveBeenCalledWith('products', 5);
    expect(result.deleted).toBe(true);
  });
});
