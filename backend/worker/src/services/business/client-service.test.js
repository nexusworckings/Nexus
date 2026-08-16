import { describe, it, expect, vi } from 'vitest';
import { ClientService } from './client-service.js';

function makeDeps() {
  return {
    insertFn: vi.fn(async (table, data) => ({ ...data, id: data.id || 'mock-uuid' })),
    queryFn: vi.fn(),
    updateFn: vi.fn(),
  };
}
function makeEventBus() {
  return { publish: vi.fn() };
}

describe('ClientService', () => {
  describe('constructor', () => {
    it('rejects missing insertFn', () => {
      expect(() => new ClientService({ queryFn: async () => {} })).toThrow('insertFn is required');
    });

    it('rejects missing queryFn', () => {
      expect(() => new ClientService({ insertFn: async () => {} })).toThrow('queryFn is required');
    });

    it('accepts valid options', () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });
      expect(svc).toBeInstanceOf(ClientService);
    });
  });

  describe('createClient', () => {
    it('creates a new client with valid data', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const svc = new ClientService(deps);

      const result = await svc.createClient({ name: 'Juan Pérez', phone: '2645123456' });

      expect(result.name).toBe('Juan Pérez');
      expect(result.phone).toBe('2645123456');
      expect(deps.insertFn).toHaveBeenCalledWith('clients', expect.objectContaining({
        name: 'Juan Pérez',
        phone: '2645123456',
      }));
    });

    it('reuses existing client by phone', async () => {
      const deps = makeDeps();
      const existing = { id: 'existing-id', name: 'Juan Pérez', phone: '2645123456' };
      deps.queryFn.mockResolvedValue([existing]);
      const svc = new ClientService(deps);

      const result = await svc.createClient({ name: 'Juan Pérez', phone: '2645123456' });

      expect(result.id).toBe('existing-id');
      expect(deps.insertFn).not.toHaveBeenCalled();
    });

    it('rejects missing name', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });
      await expect(svc.createClient({ phone: '2645123456' })).rejects.toThrow('name is required');
    });

    it('rejects empty name', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });
      await expect(svc.createClient({ name: '', phone: '2645123456' })).rejects.toThrow('name is required');
    });

    it('rejects non-string name', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });
      await expect(svc.createClient({ name: 123, phone: '2645123456' })).rejects.toThrow('name is required');
    });

    it('rejects missing phone', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });
      await expect(svc.createClient({ name: 'Juan' })).rejects.toThrow('phone is required');
    });

    it('rejects non-string phone', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });
      await expect(svc.createClient({ name: 'Juan', phone: 12345 })).rejects.toThrow('phone is required');
    });

    it('includes email when provided', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const svc = new ClientService(deps);

      await svc.createClient({ name: 'Juan', phone: '2645123456', email: 'juan@test.com' });

      expect(deps.insertFn).toHaveBeenCalledWith('clients', expect.objectContaining({
        email: 'juan@test.com',
      }));
    });

    it('sets email to null when not provided', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const svc = new ClientService(deps);

      await svc.createClient({ name: 'Juan', phone: '2645123456' });

      expect(deps.insertFn).toHaveBeenCalledWith('clients', expect.objectContaining({
        email: null,
      }));
    });

    it('includes notes when provided', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const svc = new ClientService(deps);

      await svc.createClient({ name: 'Juan', phone: '2645123456', notes: 'Cliente frecuente' });

      expect(deps.insertFn).toHaveBeenCalledWith('clients', expect.objectContaining({
        notes: 'Cliente frecuente',
      }));
    });

    it('publishes CLIENT_CREATED event when eventBus is set', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const eventBus = makeEventBus();
      const svc = new ClientService({ ...deps, eventBus });

      await svc.createClient({ name: 'Juan', phone: '2645123456' });

      expect(eventBus.publish).toHaveBeenCalledWith('CLIENT_CREATED', {
        entityId: expect.any(String),
        clientId: expect.any(String),
        metadata: { name: 'Juan', phone: '2645123456' },
      });
    });

    it('does not publish event for existing client', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'existing', name: 'Juan', phone: '2645123456' }]);
      const eventBus = makeEventBus();
      const svc = new ClientService({ ...deps, eventBus });

      await svc.createClient({ name: 'Juan', phone: '2645123456' });

      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('does not publish event when eventBus is absent', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const svc = new ClientService(deps);

      const result = await svc.createClient({ name: 'Juan', phone: '2645123456' });

      expect(result.name).toBe('Juan');
    });
  });

  describe('getClientByPhone', () => {
    it('returns client when found', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'abc', name: 'Juan', phone: '2645123456' }]);
      const svc = new ClientService(deps);

      const result = await svc.getClientByPhone('2645123456');

      expect(result.name).toBe('Juan');
      expect(deps.queryFn).toHaveBeenCalledWith('clients', { eq: { phone: '2645123456' }, limit: 1 });
    });

    it('returns null when not found', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const svc = new ClientService(deps);

      const result = await svc.getClientByPhone('2645555555');

      expect(result).toBeNull();
    });

    it('returns null for empty phone', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });

      expect(await svc.getClientByPhone('')).toBeNull();
      expect(await svc.getClientByPhone(null)).toBeNull();
    });

    it('returns null on query error', async () => {
      const deps = makeDeps();
      deps.queryFn.mockRejectedValue(new Error('DB error'));
      const svc = new ClientService(deps);

      const result = await svc.getClientByPhone('2645123456');
      expect(result).toBeNull();
    });
  });

  describe('getClient', () => {
    it('returns client by id', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'abc', name: 'Juan' }]);
      const svc = new ClientService(deps);

      const result = await svc.getClient('abc');
      expect(result.id).toBe('abc');
    });

    it('returns null for empty id', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });

      expect(await svc.getClient('')).toBeNull();
      expect(await svc.getClient(null)).toBeNull();
    });
  });

  describe('updateClient', () => {
    it('updates client fields', async () => {
      const deps = makeDeps();
      deps.updateFn.mockResolvedValue({ id: 'abc', name: 'Juan Updated' });
      const svc = new ClientService(deps);

      const result = await svc.updateClient('abc', { name: 'Juan Updated' });

      expect(deps.updateFn).toHaveBeenCalledWith('clients', 'abc', { name: 'Juan Updated' });
      expect(result.name).toBe('Juan Updated');
    });

    it('rejects missing id', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });

      await expect(svc.updateClient(null, { name: 'X' })).rejects.toThrow('id is required');
    });

    it('rejects empty update data', async () => {
      const deps = makeDeps();
      const svc = new ClientService(deps);

      await expect(svc.updateClient('abc', {})).rejects.toThrow('no fields to update');
    });

    it('requires updateFn to be configured', async () => {
      const svc = new ClientService({ insertFn: async () => {}, queryFn: async () => {} });

      await expect(svc.updateClient('abc', { name: 'X' })).rejects.toThrow('updateFn not configured');
    });

    it('propagates update errors', async () => {
      const deps = makeDeps();
      deps.updateFn.mockRejectedValue(new Error('DB error'));
      const svc = new ClientService(deps);

      await expect(svc.updateClient('abc', { name: 'X' })).rejects.toThrow('DB error');
    });
  });
});
