import { describe, it, expect, vi } from 'vitest';
import { RepairService } from './repair-service.js';

function makeInsertFn() {
  return vi.fn(async (table, data) => ({ ...data, id: data.id || 'mock-uuid' }));
}
function makeEventBus() {
  return { publish: vi.fn() };
}

describe('RepairService', () => {
  describe('constructor', () => {
    it('rejects missing insertFn', () => {
      expect(() => new RepairService()).toThrow('insertFn is required');
    });

    it('accepts valid options', () => {
      const svc = new RepairService({ insertFn: async () => {} });
      expect(svc).toBeInstanceOf(RepairService);
    });
  });

  describe('createRepair', () => {
    it('creates a repair with valid data', async () => {
      const insertFn = makeInsertFn();
      const svc = new RepairService({ insertFn });

      const result = await svc.createRepair({
        device: 'Samsung A54',
        problem: 'pantalla rota',
        urgency: 'urgent',
      });

      expect(result.id).toBeTruthy();
      expect(result.status).toBe('received');
      expect(result.device).toBe('Samsung A54');
    });

    it('uses default urgency when not provided', async () => {
      const insertFn = makeInsertFn();
      const svc = new RepairService({ insertFn });

      const result = await svc.createRepair({
        device: 'iPhone',
        problem: 'batería',
      });

      expect(result.status).toBe('received');
      expect(insertFn).toHaveBeenCalledWith('repairs', expect.objectContaining({
        urgency: 'normal',
      }));
    });

    it('includes session_id when provided', async () => {
      const insertFn = makeInsertFn();
      const svc = new RepairService({ insertFn });

      await svc.createRepair({
        sessionId: 'session-abc',
        device: 'Notebook',
        problem: 'no enciende',
      });

      expect(insertFn).toHaveBeenCalledWith('repairs', expect.objectContaining({
        session_id: 'session-abc',
      }));
    });

    it('sets session_id to null when not provided', async () => {
      const insertFn = makeInsertFn();
      const svc = new RepairService({ insertFn });

      await svc.createRepair({
        device: 'Tablet',
        problem: 'pantalla rota',
      });

      expect(insertFn).toHaveBeenCalledWith('repairs', expect.objectContaining({
        session_id: null,
      }));
    });

    it('rejects missing device', async () => {
      const svc = new RepairService({ insertFn: async () => {} });

      await expect(svc.createRepair({
        problem: 'test',
      })).rejects.toThrow('INVALID_DATA: device is required');
    });

    it('rejects empty device', async () => {
      const svc = new RepairService({ insertFn: async () => {} });

      await expect(svc.createRepair({
        device: '',
        problem: 'test',
      })).rejects.toThrow('INVALID_DATA: device is required');
    });

    it('rejects missing problem', async () => {
      const svc = new RepairService({ insertFn: async () => {} });

      await expect(svc.createRepair({
        device: 'Phone',
      })).rejects.toThrow('INVALID_DATA: problem is required');
    });

    it('rejects non-string device', async () => {
      const svc = new RepairService({ insertFn: async () => {} });

      await expect(svc.createRepair({
        device: 123,
        problem: 'test',
      })).rejects.toThrow('INVALID_DATA: device is required');
    });

    it('inserts into repairs table', async () => {
      const insertFn = makeInsertFn();
      const svc = new RepairService({ insertFn });

      await svc.createRepair({ device: 'X', problem: 'Y' });

      expect(insertFn).toHaveBeenCalledWith('repairs', expect.objectContaining({
        device: 'X',
        problem: 'Y',
        status: 'received',
      }));
    });

    it('returns id from insert result when available', async () => {
      const insertFn = vi.fn(async () => ({ id: 'db-uuid' }));
      const svc = new RepairService({ insertFn });

      const result = await svc.createRepair({ device: 'X', problem: 'Y' });

      expect(result.id).toBe('db-uuid');
    });

    it('propagates insert errors', async () => {
      const insertFn = vi.fn(async () => { throw new Error('DB timeout'); });
      const svc = new RepairService({ insertFn });

      await expect(svc.createRepair({ device: 'X', problem: 'Y' })).rejects.toThrow('DB timeout');
    });

    it('publishes REPAIR_CREATED event when eventBus is set', async () => {
      const insertFn = makeInsertFn();
      const eventBus = makeEventBus();
      const svc = new RepairService({ insertFn, eventBus });

      await svc.createRepair({ device: 'Samsung', problem: 'pantalla', clientId: 'client-1' });

      expect(eventBus.publish).toHaveBeenCalledWith('REPAIR_CREATED', {
        entityId: expect.any(String),
        clientId: 'client-1',
        metadata: { device: 'Samsung', problem: 'pantalla' },
      });
    });

    it('does not publish event when eventBus is absent', async () => {
      const insertFn = makeInsertFn();
      const svc = new RepairService({ insertFn });

      const result = await svc.createRepair({ device: 'X', problem: 'Y' });

      expect(result.status).toBe('received');
    });

    it('includes entityId from insert result in event', async () => {
      const insertFn = vi.fn(async () => ({ id: 'db-uuid' }));
      const eventBus = makeEventBus();
      const svc = new RepairService({ insertFn, eventBus });

      await svc.createRepair({ device: 'X', problem: 'Y' });

      expect(eventBus.publish).toHaveBeenCalledWith('REPAIR_CREATED', expect.objectContaining({
        entityId: 'db-uuid',
      }));
    });

    it('publishes event with null clientId when not provided', async () => {
      const insertFn = makeInsertFn();
      const eventBus = makeEventBus();
      const svc = new RepairService({ insertFn, eventBus });

      await svc.createRepair({ device: 'X', problem: 'Y' });

      expect(eventBus.publish).toHaveBeenCalledWith('REPAIR_CREATED', expect.objectContaining({
        clientId: null,
      }));
    });
  });
});
