import { describe, it, expect, vi } from 'vitest';
import { BudgetService } from './budget-service.js';

function makeInsertFn() {
  return vi.fn(async (table, data) => ({ ...data, id: data.id || 'mock-uuid' }));
}
function makeEventBus() {
  return { publish: vi.fn() };
}

describe('BudgetService', () => {
  describe('constructor', () => {
    it('rejects missing insertFn', () => {
      expect(() => new BudgetService()).toThrow('insertFn is required');
    });

    it('accepts valid options', () => {
      const svc = new BudgetService({ insertFn: async () => {} });
      expect(svc).toBeInstanceOf(BudgetService);
    });
  });

  describe('createBudget', () => {
    it('creates a budget with valid data', async () => {
      const insertFn = makeInsertFn();
      const svc = new BudgetService({ insertFn });

      const result = await svc.createBudget({
        serviceType: 'reparacion',
        description: 'cambio de pantalla',
        contact: '2645123456',
      });

      expect(result.id).toBeTruthy();
      expect(result.status).toBe('pending');
    });

    it('inserts into budgets table', async () => {
      const insertFn = makeInsertFn();
      const svc = new BudgetService({ insertFn });

      await svc.createBudget({
        serviceType: 'reparacion',
        description: 'cambio pantalla',
      });

      expect(insertFn).toHaveBeenCalledWith('budgets', expect.objectContaining({
        service_type: 'reparacion',
        description: 'cambio pantalla',
        status: 'pending',
      }));
    });

    it('includes contact when provided', async () => {
      const insertFn = makeInsertFn();
      const svc = new BudgetService({ insertFn });

      await svc.createBudget({
        serviceType: 'reparacion',
        description: 'test',
        contact: '2645000000',
      });

      expect(insertFn).toHaveBeenCalledWith('budgets', expect.objectContaining({
        contact: '2645000000',
      }));
    });

    it('sets contact to null when not provided', async () => {
      const insertFn = makeInsertFn();
      const svc = new BudgetService({ insertFn });

      await svc.createBudget({
        serviceType: 'reparacion',
        description: 'test',
      });

      expect(insertFn).toHaveBeenCalledWith('budgets', expect.objectContaining({
        contact: null,
      }));
    });

    it('rejects missing serviceType', async () => {
      const svc = new BudgetService({ insertFn: async () => {} });

      await expect(svc.createBudget({
        description: 'test',
      })).rejects.toThrow('INVALID_DATA: serviceType is required');
    });

    it('rejects empty serviceType', async () => {
      const svc = new BudgetService({ insertFn: async () => {} });

      await expect(svc.createBudget({
        serviceType: '',
        description: 'test',
      })).rejects.toThrow('INVALID_DATA: serviceType is required');
    });

    it('rejects missing description', async () => {
      const svc = new BudgetService({ insertFn: async () => {} });

      await expect(svc.createBudget({
        serviceType: 'reparacion',
      })).rejects.toThrow('INVALID_DATA: description is required');
    });

    it('rejects non-string serviceType', async () => {
      const svc = new BudgetService({ insertFn: async () => {} });

      await expect(svc.createBudget({
        serviceType: 123,
        description: 'test',
      })).rejects.toThrow('INVALID_DATA: serviceType is required');
    });

    it('returns id from insert result', async () => {
      const insertFn = vi.fn(async () => ({ id: 'budget-uuid' }));
      const svc = new BudgetService({ insertFn });

      const result = await svc.createBudget({
        serviceType: 'reparacion',
        description: 'test',
      });

      expect(result.id).toBe('budget-uuid');
    });

    it('propagates insert errors', async () => {
      const insertFn = vi.fn(async () => { throw new Error('DB error'); });
      const svc = new BudgetService({ insertFn });

      await expect(svc.createBudget({
        serviceType: 'reparacion',
        description: 'test',
      })).rejects.toThrow('DB error');
    });

    it('publishes BUDGET_CREATED event when eventBus is set', async () => {
      const insertFn = makeInsertFn();
      const eventBus = makeEventBus();
      const svc = new BudgetService({ insertFn, eventBus });

      await svc.createBudget({ serviceType: 'reparacion', description: 'cambio pantalla', clientId: 'c1' });

      expect(eventBus.publish).toHaveBeenCalledWith('BUDGET_CREATED', {
        entityId: expect.any(String),
        clientId: 'c1',
        metadata: { serviceType: 'reparacion', description: 'cambio pantalla' },
      });
    });

    it('does not publish event when eventBus is absent', async () => {
      const insertFn = makeInsertFn();
      const svc = new BudgetService({ insertFn });

      const result = await svc.createBudget({ serviceType: 'test', description: 'test' });

      expect(result.status).toBe('pending');
    });

    it('publishes event with null clientId when not provided', async () => {
      const insertFn = makeInsertFn();
      const eventBus = makeEventBus();
      const svc = new BudgetService({ insertFn, eventBus });

      await svc.createBudget({ serviceType: 'test', description: 'test' });

      expect(eventBus.publish).toHaveBeenCalledWith('BUDGET_CREATED', expect.objectContaining({
        clientId: null,
      }));
    });
  });
});
