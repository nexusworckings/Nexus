import { describe, it, expect, vi } from 'vitest';
import { EventDispatcher } from './event-dispatcher.js';

describe('EventDispatcher', () => {
  describe('constructor', () => {
    it('accepts custom eventBus', () => {
      const mockBus = { publish: vi.fn() };
      const dispatcher = new EventDispatcher({ eventBus: mockBus });
      expect(dispatcher).toBeInstanceOf(EventDispatcher);
    });

    it('accepts eventQueue', () => {
      const mockQueue = { enqueue: vi.fn() };
      const dispatcher = new EventDispatcher({ eventQueue: mockQueue });
      expect(dispatcher).toBeInstanceOf(EventDispatcher);
    });
  });

  describe('dispatch', () => {
    it('throws when event is null', async () => {
      const dispatcher = new EventDispatcher({ eventBus: { publish: vi.fn() } });
      await expect(dispatcher.dispatch(null)).rejects.toThrow('INVALID_EVENT: type is required');
    });

    it('throws when event has no type', async () => {
      const dispatcher = new EventDispatcher({ eventBus: { publish: vi.fn() } });
      await expect(dispatcher.dispatch({ entityId: 'abc' })).rejects.toThrow('INVALID_EVENT: type is required');
    });

    it('throws when event has no entityId', async () => {
      const dispatcher = new EventDispatcher({ eventBus: { publish: vi.fn() } });
      await expect(dispatcher.dispatch({ type: 'TEST' })).rejects.toThrow('INVALID_EVENT: entityId is required');
    });

    it('publishes valid event to eventBus', async () => {
      const mockBus = { publish: vi.fn() };
      const dispatcher = new EventDispatcher({ eventBus: mockBus });

      await dispatcher.dispatch({
        type: 'REPAIR_CREATED',
        entityId: 'repair-123',
        clientId: 'client-456',
        metadata: { device: 'Phone' },
      });

      expect(mockBus.publish).toHaveBeenCalledWith('REPAIR_CREATED', {
        entityId: 'repair-123',
        clientId: 'client-456',
        metadata: { device: 'Phone' },
      });
    });

    it('defaults clientId to null when not provided', async () => {
      const mockBus = { publish: vi.fn() };
      const dispatcher = new EventDispatcher({ eventBus: mockBus });

      await dispatcher.dispatch({
        type: 'TEST',
        entityId: 'abc',
      });

      expect(mockBus.publish).toHaveBeenCalledWith('TEST', {
        entityId: 'abc',
        clientId: null,
        metadata: {},
      });
    });

    it('defaults metadata to empty object', async () => {
      const mockBus = { publish: vi.fn() };
      const dispatcher = new EventDispatcher({ eventBus: mockBus });

      await dispatcher.dispatch({ type: 'TEST', entityId: 'abc' });

      expect(mockBus.publish).toHaveBeenCalledWith('TEST', {
        entityId: 'abc',
        clientId: null,
        metadata: {},
      });
    });

    it('enqueues event when eventQueue is set', async () => {
      const mockQueue = { enqueue: vi.fn().mockResolvedValue({ duplicate: false, id: 'e1' }) };
      const dispatcher = new EventDispatcher({ eventQueue: mockQueue });

      await dispatcher.dispatch({
        type: 'REPAIR_CREATED',
        entityId: 'r1',
        clientId: 'c1',
        metadata: { device: 'Phone' },
      });

      expect(mockQueue.enqueue).toHaveBeenCalledWith({
        type: 'REPAIR_CREATED',
        entityId: 'r1',
        clientId: 'c1',
        metadata: { device: 'Phone' },
      });
    });

    it('does not enqueue when eventQueue is absent', async () => {
      const mockBus = { publish: vi.fn() };
      const dispatcher = new EventDispatcher({ eventBus: mockBus });

      const result = await dispatcher.dispatch({ type: 'TEST', entityId: 'abc' });

      expect(result).toBeUndefined();
    });

    it('publishes to eventBus AND enqueues when both are set', async () => {
      const mockBus = { publish: vi.fn() };
      const mockQueue = { enqueue: vi.fn().mockResolvedValue({ duplicate: false, id: 'e1' }) };
      const dispatcher = new EventDispatcher({ eventBus: mockBus, eventQueue: mockQueue });

      await dispatcher.dispatch({ type: 'TEST', entityId: 'abc' });

      expect(mockBus.publish).toHaveBeenCalled();
      expect(mockQueue.enqueue).toHaveBeenCalled();
    });
  });
});
