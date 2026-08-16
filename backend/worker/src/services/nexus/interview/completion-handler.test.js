import { describe, it, expect, vi } from 'vitest';
import { CompletionHandler } from './completion-handler.js';

function makeMockService() {
  return { createRepair: vi.fn(), createBudget: vi.fn(), createPrintOrder: vi.fn() };
}

function makeMockResolver() {
  return { resolve: vi.fn() };
}

function makeHandler(options = {}) {
  const repairService = options.repairService || makeMockService();
  const budgetService = options.budgetService || makeMockService();
  const printService = options.printService || makeMockService();
  const clientResolver = options.clientResolver;
  return {
    handler: new CompletionHandler({ repairService, budgetService, printService, clientResolver }),
    repairService,
    budgetService,
    printService,
    clientResolver,
  };
}

function makeSession(overrides = {}) {
  return {
    sessionId: 'session-abc',
    state: {
      completedFields: {},
      ...overrides.state,
    },
    schema: {
      serviceId: 'repair-request',
      ...overrides.schema,
    },
    ...overrides,
  };
}

describe('CompletionHandler', () => {
  describe('constructor', () => {
    it('rejects missing repairService', () => {
      expect(() => new CompletionHandler({ budgetService: {}, printService: {} })).toThrow('repairService is required');
    });

    it('rejects missing budgetService', () => {
      expect(() => new CompletionHandler({ repairService: {}, printService: {} })).toThrow('budgetService is required');
    });

    it('rejects missing printService', () => {
      expect(() => new CompletionHandler({ repairService: {}, budgetService: {} })).toThrow('printService is required');
    });

    it('accepts valid options without clientResolver', () => {
      const { handler } = makeHandler();
      expect(handler).toBeInstanceOf(CompletionHandler);
    });

    it('accepts valid options with clientResolver', () => {
      const { handler } = makeHandler({ clientResolver: makeMockResolver() });
      expect(handler).toBeInstanceOf(CompletionHandler);
    });
  });

  describe('handle', () => {
    it('returns error for invalid session', async () => {
      const { handler } = makeHandler();
      const result = await handler.handle(null, {});
      expect(result.success).toBe(false);
    });

    it('returns error for session without state', async () => {
      const { handler } = makeHandler();
      const result = await handler.handle({ schema: { serviceId: 'x' } }, {});
      expect(result.success).toBe(false);
    });

    it('returns error for missing schemaId', async () => {
      const { handler } = makeHandler();
      const result = await handler.handle({ state: {} }, {});
      expect(result.success).toBe(false);
    });

    it('returns error for unknown schemaId', async () => {
      const { handler } = makeHandler();
      const session = { state: {}, schema: { serviceId: 'unknown' } };
      const result = await handler.handle(session, {});
      expect(result.success).toBe(false);
    });
  });

  describe('client resolver integration', () => {
    it('resolves client before creating repair', async () => {
      const mockResolver = makeMockResolver();
      mockResolver.resolve.mockResolvedValue({ clientId: 'client-123', isNew: true });
      const { handler, repairService } = makeHandler({ clientResolver: mockResolver });
      repairService.createRepair.mockResolvedValue({ id: 'repair-uuid' });
      const session = makeSession({ schema: { serviceId: 'repair-request' } });
      const fields = {
        clientName: { value: 'Juan' },
        clientPhone: { value: '2645123456' },
        device: { value: 'Samsung' },
        problem: { value: 'pantalla' },
      };

      const result = await handler.handle(session, fields);

      expect(mockResolver.resolve).toHaveBeenCalledWith({ name: 'Juan', phone: '2645123456' });
      expect(repairService.createRepair).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'client-123',
      }));
      expect(result.clientId).toBe('client-123');
      expect(result.clientCreated).toBe(true);
    });

    it('resolves client before creating budget', async () => {
      const mockResolver = makeMockResolver();
      mockResolver.resolve.mockResolvedValue({ clientId: 'client-456', isNew: false });
      const { handler, budgetService } = makeHandler({ clientResolver: mockResolver });
      budgetService.createBudget.mockResolvedValue({ id: 'budget-uuid' });
      const session = makeSession({ schema: { serviceId: 'budget-request' } });
      const fields = {
        clientName: { value: 'Maria' },
        clientPhone: { value: '2645987654' },
        serviceType: { value: 'reparacion' },
        description: { value: 'cambio pantalla' },
      };

      const result = await handler.handle(session, fields);

      expect(mockResolver.resolve).toHaveBeenCalledWith({ name: 'Maria', phone: '2645987654' });
      expect(budgetService.createBudget).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'client-456',
      }));
      expect(result.clientId).toBe('client-456');
      expect(result.clientCreated).toBe(false);
    });

    it('resolves client before creating print order', async () => {
      const mockResolver = makeMockResolver();
      mockResolver.resolve.mockResolvedValue({ clientId: 'client-789', isNew: true });
      const { handler, printService } = makeHandler({ clientResolver: mockResolver });
      printService.createPrintOrder.mockResolvedValue({ id: 'print-uuid' });
      const session = makeSession({ schema: { serviceId: 'print-order' } });
      const fields = {
        clientName: { value: 'Pedro' },
        clientPhone: { value: '2645111222' },
        objectDescription: { value: 'soporte' },
        material: { value: 'PLA' },
      };

      const result = await handler.handle(session, fields);

      expect(mockResolver.resolve).toHaveBeenCalledWith({ name: 'Pedro', phone: '2645111222' });
      expect(printService.createPrintOrder).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'client-789',
      }));
      expect(result.clientId).toBe('client-789');
      expect(result.clientCreated).toBe(true);
    });

    it('does not resolve client when fields lack name/phone', async () => {
      const mockResolver = makeMockResolver();
      const { handler, repairService } = makeHandler({ clientResolver: mockResolver });
      repairService.createRepair.mockResolvedValue({ id: 'uuid' });
      const session = makeSession({ schema: { serviceId: 'repair-request' } });
      const fields = { device: { value: 'X' }, problem: { value: 'Y' } };

      await handler.handle(session, fields);

      expect(mockResolver.resolve).not.toHaveBeenCalled();
      expect(repairService.createRepair).toHaveBeenCalledWith(expect.objectContaining({
        clientId: null,
      }));
    });

    it('works without clientResolver', async () => {
      const { handler, repairService } = makeHandler();
      repairService.createRepair.mockResolvedValue({ id: 'uuid' });
      const session = makeSession({ schema: { serviceId: 'repair-request' } });
      const fields = { device: { value: 'X' }, problem: { value: 'Y' } };

      const result = await handler.handle(session, fields);

      expect(repairService.createRepair).toHaveBeenCalledWith(expect.objectContaining({
        clientId: null,
      }));
      expect(result.success).toBe(true);
    });

    it('still creates entity even if client resolver errors', async () => {
      const mockResolver = makeMockResolver();
      mockResolver.resolve.mockRejectedValue(new Error('Resolver error'));
      const { handler, repairService } = makeHandler({ clientResolver: mockResolver });
      repairService.createRepair.mockResolvedValue({ id: 'uuid' });
      const session = makeSession({ schema: { serviceId: 'repair-request' } });
      const fields = {
        clientName: { value: 'Juan' },
        clientPhone: { value: '2645123456' },
        device: { value: 'X' },
        problem: { value: 'Y' },
      };

      const result = await handler.handle(session, fields);

      expect(repairService.createRepair).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('repair-request processing', () => {
    it('calls repairService.createRepair for repair-request schema', async () => {
      const { handler, repairService } = makeHandler();
      repairService.createRepair.mockResolvedValue({ id: 'repair-uuid' });
      const session = makeSession({ schema: { serviceId: 'repair-request' } });
      const fields = { device: { value: 'Samsung' }, problem: { value: 'pantalla' }, urgency: { value: 'urgent' } };

      const result = await handler.handle(session, fields);

      expect(repairService.createRepair).toHaveBeenCalledWith({
        sessionId: 'session-abc',
        clientId: null,
        device: 'Samsung',
        problem: 'pantalla',
        urgency: 'urgent',
      });
      expect(result.success).toBe(true);
      expect(result.type).toBe('repair');
      expect(result.entityId).toBe('repair-uuid');
    });

    it('uses empty strings for missing repair fields', async () => {
      const { handler, repairService } = makeHandler();
      repairService.createRepair.mockResolvedValue({ id: 'uuid' });
      const session = makeSession({ schema: { serviceId: 'repair-request' } });

      await handler.handle(session, {});

      expect(repairService.createRepair).toHaveBeenCalledWith({
        sessionId: 'session-abc',
        clientId: null,
        device: '',
        problem: '',
        urgency: 'normal',
      });
    });

    it('returns error when repair creation fails', async () => {
      const { handler, repairService } = makeHandler();
      repairService.createRepair.mockRejectedValue(new Error('DB error'));
      const session = makeSession({ schema: { serviceId: 'repair-request' } });
      const fields = { device: { value: 'X' }, problem: { value: 'Y' } };

      const result = await handler.handle(session, fields);

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });

  describe('budget-request processing', () => {
    it('calls budgetService.createBudget for budget-request schema', async () => {
      const { handler, budgetService } = makeHandler();
      budgetService.createBudget.mockResolvedValue({ id: 'budget-uuid' });
      const session = makeSession({ schema: { serviceId: 'budget-request' } });
      const fields = { serviceType: { value: 'reparacion' }, description: { value: 'cambio pantalla' } };

      const result = await handler.handle(session, fields);

      expect(budgetService.createBudget).toHaveBeenCalledWith({
        sessionId: 'session-abc',
        clientId: null,
        serviceType: 'reparacion',
        description: 'cambio pantalla',
        contact: '',
      });
      expect(result.success).toBe(true);
      expect(result.type).toBe('budget');
      expect(result.entityId).toBe('budget-uuid');
    });

    it('uses empty strings for missing budget fields', async () => {
      const { handler, budgetService } = makeHandler();
      budgetService.createBudget.mockResolvedValue({ id: 'uuid' });
      const session = makeSession({ schema: { serviceId: 'budget-request' } });

      await handler.handle(session, {});

      expect(budgetService.createBudget).toHaveBeenCalledWith({
        sessionId: 'session-abc',
        clientId: null,
        serviceType: '',
        description: '',
        contact: '',
      });
    });

    it('returns error when budget creation fails', async () => {
      const { handler, budgetService } = makeHandler();
      budgetService.createBudget.mockRejectedValue(new Error('Validation error'));
      const session = makeSession({ schema: { serviceId: 'budget-request' } });

      const result = await handler.handle(session, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation error');
    });
  });

  describe('print-order processing', () => {
    it('calls printService.createPrintOrder for print-order schema', async () => {
      const { handler, printService } = makeHandler();
      printService.createPrintOrder.mockResolvedValue({ id: 'print-uuid' });
      const session = makeSession({ schema: { serviceId: 'print-order' } });
      const fields = {
        objectDescription: { value: 'soporte' },
        material: { value: 'PLA' },
        colors: { value: ['negro'] },
        quantity: { value: 2 },
      };

      const result = await handler.handle(session, fields);

      expect(printService.createPrintOrder).toHaveBeenCalledWith({
        sessionId: 'session-abc',
        clientId: null,
        objectDescription: 'soporte',
        material: 'PLA',
        colors: ['negro'],
        quantity: 2,
      });
      expect(result.success).toBe(true);
      expect(result.type).toBe('print-order');
      expect(result.entityId).toBe('print-uuid');
    });

    it('uses defaults for missing print fields', async () => {
      const { handler, printService } = makeHandler();
      printService.createPrintOrder.mockResolvedValue({ id: 'uuid' });
      const session = makeSession({ schema: { serviceId: 'print-order' } });

      await handler.handle(session, {});

      expect(printService.createPrintOrder).toHaveBeenCalledWith({
        sessionId: 'session-abc',
        clientId: null,
        objectDescription: '',
        material: '',
        colors: [],
        quantity: 1,
      });
    });

    it('returns error when print order creation fails', async () => {
      const { handler, printService } = makeHandler();
      printService.createPrintOrder.mockRejectedValue(new Error('Invalid material'));
      const session = makeSession({ schema: { serviceId: 'print-order' } });

      const result = await handler.handle(session, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid material');
    });
  });
});
