import { describe, it, expect, vi } from 'vitest';
import { ContactResolver } from './contact-resolver.js';

describe('ContactResolver', () => {
  it('resolveByPhone returns existing client', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'cli-1', name: 'Juan', phone: '5492645555' }]);
    const cr = new ContactResolver({ query });
    const result = await cr.resolveByPhone('5492645555');
    expect(result.existed).toBe(true);
    expect(result.clientId).toBe('cli-1');
    expect(result.clientName).toBe('Juan');
  });

  it('resolveByPhone creates client when name provided', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const insert = vi.fn().mockResolvedValue(undefined);
    const cr = new ContactResolver({ query, insert });
    const result = await cr.resolveByPhone('5492645555', 'Maria');
    expect(result.existed).toBe(false);
    expect(result.clientName).toBe('Maria');
    expect(insert).toHaveBeenCalled();
  });

  it('resolveByPhone returns partial result when no name and no client', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const cr = new ContactResolver({ query });
    const result = await cr.resolveByPhone('5492645555');
    expect(result.existed).toBe(false);
    expect(result.clientId).toBeNull();
  });

  it('resolveByPhone throws without phone', async () => {
    const cr = new ContactResolver({});
    await expect(cr.resolveByPhone()).rejects.toThrow('phone is required');
  });

  it('resolveOrCreate creates client when not found with name', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const insert = vi.fn().mockResolvedValue(undefined);
    const cr = new ContactResolver({ query, insert });
    const result = await cr.resolveOrCreate('5492645555', 'Pedro');
    expect(result.existed).toBe(false);
    expect(result.clientName).toBe('Pedro');
  });

  it('resolveOrCreate creates client with fallback name', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const insert = vi.fn().mockResolvedValue(undefined);
    const cr = new ContactResolver({ query, insert });
    const result = await cr.resolveOrCreate('5492645555');
    expect(result.existed).toBe(false);
    expect(result.clientName).toContain('Cliente');
  });

  it('resolveOrCreate returns existing client', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'cli-1', name: 'Juan', phone: '5492645555' }]);
    const cr = new ContactResolver({ query });
    const result = await cr.resolveOrCreate('5492645555', 'Juan');
    expect(result.existed).toBe(true);
  });

  it('search by partial phone when exact not found', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'cli-2', name: 'Ana', phone: '5492643333' }]);
    const cr = new ContactResolver({ query });
    const result = await cr.resolveByPhone('5492643333');
    expect(result.existed).toBe(true);
    expect(result.clientName).toBe('Ana');
  });

  it('creates client with generated UUID', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const insert = vi.fn().mockResolvedValue(undefined);
    const cr = new ContactResolver({ query, insert });
    const result = await cr.resolveOrCreate('5492645555', 'Test');
    expect(result.clientId).toBeTruthy();
    expect(result.clientId).not.toBeNull();
  });

  it('handles query errors gracefully', async () => {
    const query = vi.fn().mockRejectedValue(new Error('DB error'));
    const cr = new ContactResolver({ query });
    const result = await cr.resolveByPhone('5492645555', 'Test');
    expect(result.existed).toBe(false);
    expect(result.clientId).toBeTruthy();
  });
});
