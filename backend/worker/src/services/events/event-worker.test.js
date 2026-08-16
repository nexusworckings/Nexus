import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventWorker } from './event-worker.js';

function makeMockQueue() {
  return {
    dequeue: vi.fn(),
    acknowledge: vi.fn(),
    reject: vi.fn(),
  };
}

function makeWorker(queue, handlers) {
  return new EventWorker({ eventQueue: queue || makeMockQueue(), handlers: handlers || {} });
}

describe('EventWorker', () => {
  describe('constructor', () => {
    it('rejects missing eventQueue', () => {
      expect(() => new EventWorker()).toThrow('eventQueue is required');
    });
  });

  describe('processEvent', () => {
    it('completes event when handler succeeds', async () => {
      const queue = makeMockQueue();
      const handler = vi.fn().mockResolvedValue(undefined);
      const worker = makeWorker(queue, { TEST_EVENT: handler });

      const event = { eventId: 'evt-1', type: 'TEST_EVENT', clientId: 'c1', metadata: {} };
      const result = await worker.processEvent(event);

      expect(handler).toHaveBeenCalledWith(event);
      expect(queue.acknowledge).toHaveBeenCalledWith('evt-1');
      expect(result).toEqual({ eventId: 'evt-1', status: 'completed' });
    });

    it('skips event when no handler registered', async () => {
      const queue = makeMockQueue();
      const worker = makeWorker(queue, {});

      const event = { eventId: 'evt-1', type: 'UNKNOWN_TYPE', clientId: null, metadata: {} };
      const result = await worker.processEvent(event);

      expect(queue.acknowledge).toHaveBeenCalledWith('evt-1');
      expect(result).toEqual({ eventId: 'evt-1', status: 'skipped', reason: 'no_handler' });
    });

    it('rejects event when handler throws', async () => {
      const queue = makeMockQueue();
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      const worker = makeWorker(queue, { FAIL: handler });

      const event = { eventId: 'evt-2', type: 'FAIL', clientId: null, metadata: {}, attempts: 0 };
      const result = await worker.processEvent(event);

      expect(queue.reject).toHaveBeenCalledWith('evt-2', 'Handler error');
      expect(result.status).toBe('retrying');
      expect(result.attempts).toBe(1);
    });

    it('marks as failed after max retries', async () => {
      const queue = makeMockQueue();
      const handler = vi.fn().mockRejectedValue(new Error('Final error'));
      const worker = makeWorker(queue, { FAIL: handler });

      const event = { eventId: 'evt-3', type: 'FAIL', clientId: null, metadata: {}, attempts: 2 };
      const result = await worker.processEvent(event);

      expect(queue.reject).toHaveBeenCalledWith('evt-3', 'Final error');
      expect(result.status).toBe('failed');
      expect(result.attempts).toBe(3);
    });
  });

  describe('processBatch', () => {
    it('processes multiple events and returns results', async () => {
      const queue = makeMockQueue();
      queue.dequeue.mockResolvedValue([
        { eventId: 'evt-1', type: 'A', clientId: null, metadata: {}, attempts: 0 },
        { eventId: 'evt-2', type: 'B', clientId: null, metadata: {}, attempts: 0 },
      ]);
      const handlerA = vi.fn().mockResolvedValue(undefined);
      const handlerB = vi.fn().mockResolvedValue(undefined);
      const worker = makeWorker(queue, { A: handlerA, B: handlerB });

      const results = await worker.processBatch();

      expect(results.length).toBe(2);
      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('completed');
      expect(handlerA).toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalled();
    });

    it('handles mixed success and failure', async () => {
      const queue = makeMockQueue();
      queue.dequeue.mockResolvedValue([
        { eventId: 'evt-1', type: 'OK', clientId: null, metadata: {}, attempts: 0 },
        { eventId: 'evt-2', type: 'FAIL', clientId: null, metadata: {}, attempts: 0 },
      ]);
      const handlerOk = vi.fn().mockResolvedValue(undefined);
      const handlerFail = vi.fn().mockRejectedValue(new Error('Failed'));
      const worker = makeWorker(queue, { OK: handlerOk, FAIL: handlerFail });

      const results = await worker.processBatch();

      expect(results[0].status).toBe('completed');
      expect(results[1].status).toBe('retrying');
    });

    it('returns empty array when no pending events', async () => {
      const queue = makeMockQueue();
      queue.dequeue.mockResolvedValue([]);
      const worker = makeWorker(queue, {});

      const results = await worker.processBatch(5);

      expect(results).toEqual([]);
      expect(queue.dequeue).toHaveBeenCalledWith(5);
    });

    it('defaults limit to 10', async () => {
      const queue = makeMockQueue();
      queue.dequeue.mockResolvedValue([]);
      const worker = makeWorker(queue, {});

      await worker.processBatch();

      expect(queue.dequeue).toHaveBeenCalledWith(10);
    });
  });
});
