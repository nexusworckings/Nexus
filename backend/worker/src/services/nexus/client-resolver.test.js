import { describe, it, expect, vi } from 'vitest';
import { ClientResolver } from './client-resolver.js';

function makeMockClientService() {
  return {
    getClientByPhone: vi.fn(),
    createClient: vi.fn(),
  };
}

function makeResolver(options = {}) {
  const clientService = options.clientService || makeMockClientService();
  return {
    resolver: new ClientResolver({ clientService }),
    clientService,
  };
}

describe('ClientResolver', () => {
  describe('constructor', () => {
    it('rejects missing clientService', () => {
      expect(() => new ClientResolver()).toThrow('clientService is required');
    });

    it('accepts valid options', () => {
      const { resolver } = makeResolver();
      expect(resolver).toBeInstanceOf(ClientResolver);
    });
  });

  describe('resolve', () => {
    it('returns existing client when phone matches', async () => {
      const { resolver, clientService } = makeResolver();
      clientService.getClientByPhone.mockResolvedValue({ id: 'existing-id', name: 'Juan', phone: '2645123456' });

      const result = await resolver.resolve({ name: 'Juan', phone: '2645123456' });

      expect(result.clientId).toBe('existing-id');
      expect(result.isNew).toBe(false);
      expect(clientService.createClient).not.toHaveBeenCalled();
    });

    it('creates new client when phone not found', async () => {
      const { resolver, clientService } = makeResolver();
      clientService.getClientByPhone.mockResolvedValue(null);
      clientService.createClient.mockResolvedValue({ id: 'new-id', name: 'Maria', phone: '2645987654' });

      const result = await resolver.resolve({ name: 'Maria', phone: '2645987654' });

      expect(result.clientId).toBe('new-id');
      expect(result.isNew).toBe(true);
      expect(clientService.createClient).toHaveBeenCalledWith({
        name: 'Maria',
        phone: '2645987654',
        email: null,
      });
    });

    it('passes email when creating new client', async () => {
      const { resolver, clientService } = makeResolver();
      clientService.getClientByPhone.mockResolvedValue(null);
      clientService.createClient.mockResolvedValue({ id: 'new-id' });

      await resolver.resolve({ name: 'Maria', phone: '2645987654', email: 'maria@test.com' });

      expect(clientService.createClient).toHaveBeenCalledWith({
        name: 'Maria',
        phone: '2645987654',
        email: 'maria@test.com',
      });
    });

    it('returns null clientId when name is empty', async () => {
      const { resolver, clientService } = makeResolver();

      const result = await resolver.resolve({ name: '', phone: '2645123456' });

      expect(result.clientId).toBeNull();
      expect(result.isNew).toBe(false);
      expect(clientService.getClientByPhone).not.toHaveBeenCalled();
    });

    it('returns null clientId when phone is empty', async () => {
      const { resolver, clientService } = makeResolver();

      const result = await resolver.resolve({ name: 'Juan', phone: '' });

      expect(result.clientId).toBeNull();
      expect(result.isNew).toBe(false);
      expect(clientService.getClientByPhone).not.toHaveBeenCalled();
    });

    it('returns null clientId when both name and phone are missing', async () => {
      const { resolver } = makeResolver();

      const result = await resolver.resolve({});

      expect(result.clientId).toBeNull();
      expect(result.isNew).toBe(false);
    });

    it('returns null clientId when data is empty', async () => {
      const { resolver } = makeResolver();

      const result = await resolver.resolve();

      expect(result.clientId).toBeNull();
      expect(result.isNew).toBe(false);
    });

    it('handles getClientByPhone error by creating new client', async () => {
      const { resolver, clientService } = makeResolver();
      clientService.getClientByPhone.mockRejectedValue(new Error('DB error'));
      clientService.createClient.mockResolvedValue({ id: 'fallback-id' });

      const result = await resolver.resolve({ name: 'Pedro', phone: '2645111222' });

      expect(result.clientId).toBe('fallback-id');
      expect(result.isNew).toBe(true);
    });

    it('propagates createClient errors', async () => {
      const { resolver, clientService } = makeResolver();
      clientService.getClientByPhone.mockResolvedValue(null);
      clientService.createClient.mockRejectedValue(new Error('Insert failed'));

      await expect(resolver.resolve({ name: 'Luis', phone: '2645333444' })).rejects.toThrow('Insert failed');
    });
  });
});
