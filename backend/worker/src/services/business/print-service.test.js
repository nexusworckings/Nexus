import { describe, it, expect, vi } from 'vitest';
import { PrintService } from './print-service.js';

function makeInsertFn() {
  return vi.fn(async (table, data) => ({ ...data, id: data.id || 'mock-uuid' }));
}
function makeEventBus() {
  return { publish: vi.fn() };
}

describe('PrintService', () => {
  describe('constructor', () => {
    it('rejects missing insertFn', () => {
      expect(() => new PrintService()).toThrow('insertFn is required');
    });

    it('accepts valid options', () => {
      const svc = new PrintService({ insertFn: async () => {} });
      expect(svc).toBeInstanceOf(PrintService);
    });
  });

  describe('createPrintOrder', () => {
    it('creates a print order with valid data', async () => {
      const insertFn = makeInsertFn();
      const svc = new PrintService({ insertFn });

      const result = await svc.createPrintOrder({
        objectDescription: 'soporte celular',
        material: 'PLA',
        colors: ['negro'],
        quantity: 2,
      });

      expect(result.id).toBeTruthy();
      expect(result.status).toBe('pending');
    });

    it('inserts into print_orders table', async () => {
      const insertFn = makeInsertFn();
      const svc = new PrintService({ insertFn });

      await svc.createPrintOrder({
        objectDescription: 'soporte',
        material: 'PLA',
      });

      expect(insertFn).toHaveBeenCalledWith('print_orders', expect.objectContaining({
        description: 'soporte',
        material: 'PLA',
        quantity: 1,
      }));
    });

    it('serializes colors as JSON string', async () => {
      const insertFn = makeInsertFn();
      const svc = new PrintService({ insertFn });

      await svc.createPrintOrder({
        objectDescription: 'figura',
        material: 'ABS',
        colors: ['rojo', 'azul'],
        quantity: 1,
      });

      expect(insertFn).toHaveBeenCalledWith('print_orders', expect.objectContaining({
        colors: JSON.stringify(['rojo', 'azul']),
      }));
    });

    it('defaults colors to empty array when not provided', async () => {
      const insertFn = makeInsertFn();
      const svc = new PrintService({ insertFn });

      await svc.createPrintOrder({
        objectDescription: 'test',
        material: 'PLA',
      });

      expect(insertFn).toHaveBeenCalledWith('print_orders', expect.objectContaining({
        colors: '[]',
      }));
    });

    it('rejects missing objectDescription', async () => {
      const svc = new PrintService({ insertFn: async () => {} });

      await expect(svc.createPrintOrder({
        material: 'PLA',
      })).rejects.toThrow('INVALID_DATA: objectDescription is required');
    });

    it('rejects empty objectDescription', async () => {
      const svc = new PrintService({ insertFn: async () => {} });

      await expect(svc.createPrintOrder({
        objectDescription: '',
        material: 'PLA',
      })).rejects.toThrow('INVALID_DATA: objectDescription is required');
    });

    it('rejects missing material', async () => {
      const svc = new PrintService({ insertFn: async () => {} });

      await expect(svc.createPrintOrder({
        objectDescription: 'test',
      })).rejects.toThrow('INVALID_DATA: material is required');
    });

    it('rejects quantity less than 1', async () => {
      const svc = new PrintService({ insertFn: async () => {} });

      await expect(svc.createPrintOrder({
        objectDescription: 'test',
        material: 'PLA',
        quantity: 0,
      })).rejects.toThrow('INVALID_DATA: quantity must be a positive number');
    });

    it('rejects non-number quantity', async () => {
      const svc = new PrintService({ insertFn: async () => {} });

      await expect(svc.createPrintOrder({
        objectDescription: 'test',
        material: 'PLA',
        quantity: 'abc',
      })).rejects.toThrow('INVALID_DATA: quantity must be a positive number');
    });

    it('accepts valid quantity of 1', async () => {
      const insertFn = makeInsertFn();
      const svc = new PrintService({ insertFn });

      const result = await svc.createPrintOrder({
        objectDescription: 'test',
        material: 'PLA',
        quantity: 1,
      });

      expect(result.status).toBe('pending');
    });

    it('accepts quantity over 100', async () => {
      const insertFn = makeInsertFn();
      const svc = new PrintService({ insertFn });

      const result = await svc.createPrintOrder({
        objectDescription: 'test',
        material: 'PLA',
        quantity: 200,
      });

      expect(result.status).toBe('pending');
      expect(insertFn).toHaveBeenCalledWith('print_orders', expect.objectContaining({
        quantity: 200,
      }));
    });

    it('propagates insert errors', async () => {
      const insertFn = vi.fn(async () => { throw new Error('DB timeout'); });
      const svc = new PrintService({ insertFn });

      await expect(svc.createPrintOrder({
        objectDescription: 'test',
        material: 'PLA',
      })).rejects.toThrow('DB timeout');
    });

    it('publishes PRINT_ORDER_CREATED event when eventBus is set', async () => {
      const insertFn = makeInsertFn();
      const eventBus = makeEventBus();
      const svc = new PrintService({ insertFn, eventBus });

      await svc.createPrintOrder({ objectDescription: 'soporte', material: 'PLA', clientId: 'c1' });

      expect(eventBus.publish).toHaveBeenCalledWith('PRINT_ORDER_CREATED', {
        entityId: expect.any(String),
        clientId: 'c1',
        metadata: { description: 'soporte', material: 'PLA' },
      });
    });

    it('does not publish event when eventBus is absent', async () => {
      const insertFn = makeInsertFn();
      const svc = new PrintService({ insertFn });

      const result = await svc.createPrintOrder({ objectDescription: 'test', material: 'PLA' });

      expect(result.status).toBe('pending');
    });

    it('publishes event with null clientId when not provided', async () => {
      const insertFn = makeInsertFn();
      const eventBus = makeEventBus();
      const svc = new PrintService({ insertFn, eventBus });

      await svc.createPrintOrder({ objectDescription: 'test', material: 'PLA' });

      expect(eventBus.publish).toHaveBeenCalledWith('PRINT_ORDER_CREATED', expect.objectContaining({
        clientId: null,
      }));
    });
  });
});
