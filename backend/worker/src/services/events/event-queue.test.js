import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventQueue } from './event-queue.js';

function makeMockRepository() {
  return {
    create: vi.fn(async (ev) => ({ ...ev, id: ev.id || 'new-id' })),
    findByEventId: vi.fn(),
    getPending: vi.fn(),
    markProcessing: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    incrementAttempts: vi.fn(),
    moveToDlq: vi.fn(),
    getDlq: vi.fn(),
    getDlqById: vi.fn(),
    markDlqReplayed: vi.fn(),
    removeFromDlq: vi.fn(),
  };
}

function makeQueue(repo) {
  return new EventQueue({ eventRepository: repo || makeMockRepository() });
}

describe('EventQueue', () => {
  describe('constructor', () => {
    it('rejects missing eventRepository', () => {
      expect(() => new EventQueue()).toThrow('eventRepository is required');
    });
  });

  describe('enqueue', () => {
    it('throws when event has no type', async () => {
      const q = makeQueue();
      await expect(q.enqueue({ entityId: 'abc' })).rejects.toThrow('INVALID_EVENT: type is required');
    });

    it('throws when event is null', async () => {
      const q = makeQueue();
      await expect(q.enqueue(null)).rejects.toThrow('INVALID_EVENT: type is required');
    });

    it('throws when event has no entityId', async () => {
      const q = makeQueue();
      await expect(q.enqueue({ type: 'TEST' })).rejects.toThrow('INVALID_EVENT: entityId is required');
    });

    it('creates event when no duplicate exists', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue(null);
      const q = makeQueue(repo);

      const result = await q.enqueue({ type: 'REPAIR_CREATED', entityId: 'r1', clientId: 'c1' });

      expect(result.duplicate).toBe(false);
      expect(result.id).toBeTruthy();
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'REPAIR_CREATED',
        entityId: 'r1',
        clientId: 'c1',
      }));
    });

    it('uses provided eventId', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue(null);
      const q = makeQueue(repo);

      await q.enqueue({ type: 'TEST', entityId: 'e1', eventId: 'custom-id' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'custom-id',
      }));
    });

    it('generates eventId when not provided', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue(null);
      const q = makeQueue(repo);

      await q.enqueue({ type: 'TEST', entityId: 'e1' });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        eventId: expect.any(String),
      }));
    });
  });

  describe('deduplication', () => {
    it('returns duplicate when eventId already exists', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue({ id: 'existing-id', event_id: 'dup-id' });
      const q = makeQueue(repo);

      const result = await q.enqueue({ type: 'TEST', entityId: 'e1', eventId: 'dup-id' });

      expect(result.duplicate).toBe(true);
      expect(result.existingId).toBe('existing-id');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('does not create duplicate records for same eventId', async () => {
      const repo = makeMockRepository();
      repo.findByEventId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing', event_id: 'same-id' });
      const q = makeQueue(repo);

      const first = await q.enqueue({ type: 'TEST', entityId: 'e1', eventId: 'same-id' });
      const second = await q.enqueue({ type: 'TEST', entityId: 'e1', eventId: 'same-id' });

      expect(first.duplicate).toBe(false);
      expect(second.duplicate).toBe(true);
      expect(repo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('dequeue', () => {
    it('returns pending events marked as processing', async () => {
      const repo = makeMockRepository();
      repo.getPending.mockResolvedValue([
        { id: 'e1', event_id: 'evt-1', type: 'REPAIR_CREATED', entity_id: 'r1', client_id: 'c1', payload: '{"device":"Phone"}', attempts: 0 },
        { id: 'e2', event_id: 'evt-2', type: 'BUDGET_CREATED', entity_id: 'b1', client_id: null, payload: '{}', attempts: 1 },
      ]);
      const q = makeQueue(repo);

      const events = await q.dequeue(5);

      expect(events.length).toBe(2);
      expect(events[0].eventId).toBe('evt-1');
      expect(events[0].type).toBe('REPAIR_CREATED');
      expect(events[0].metadata).toEqual({ device: 'Phone' });
      expect(events[0].attempts).toBe(0);
      expect(events[1].eventId).toBe('evt-2');
      expect(events[1].clientId).toBeNull();
      expect(repo.markProcessing).toHaveBeenCalledWith('e1');
      expect(repo.markProcessing).toHaveBeenCalledWith('e2');
    });

    it('defaults limit to 10', async () => {
      const repo = makeMockRepository();
      repo.getPending.mockResolvedValue([]);
      const q = makeQueue(repo);

      await q.dequeue();

      expect(repo.getPending).toHaveBeenCalledWith(10);
    });

    it('parses payload JSON correctly', async () => {
      const repo = makeMockRepository();
      repo.getPending.mockResolvedValue([
        { id: 'e1', event_id: 'evt-1', type: 'TEST', entity_id: null, client_id: null, payload: '{"key":"value"}', attempts: 0 },
      ]);
      const q = makeQueue(repo);

      const events = await q.dequeue();
      expect(events[0].metadata).toEqual({ key: 'value' });
    });
  });

  describe('acknowledge', () => {
    it('marks event as completed', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue({ id: 'e1', event_id: 'evt-1' });
      const q = makeQueue(repo);

      await q.acknowledge('evt-1');

      expect(repo.markCompleted).toHaveBeenCalledWith('e1');
    });

    it('does nothing when event not found', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue(null);
      const q = makeQueue(repo);

      await q.acknowledge('unknown');
      expect(repo.markCompleted).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('increments attempts and requeues when under max retries', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue({ id: 'e1', event_id: 'evt-1', type: 'TEST', entity_id: 'e1', client_id: 'c1', payload: '{}', attempts: 0 });
      repo.incrementAttempts.mockResolvedValue(1);
      const q = makeQueue(repo);

      await q.reject('evt-1', 'Timeout');

      expect(repo.markCompleted).toHaveBeenCalledWith('e1');
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'evt-1',
        type: 'TEST',
      }));
    });

    it('marks as failed when max retries reached', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue({ id: 'e1', event_id: 'evt-1', type: 'TEST', entity_id: 'e1', client_id: null, payload: '{}', attempts: 2 });
      repo.incrementAttempts.mockResolvedValue(3);
      const q = makeQueue(repo);

      await q.reject('evt-1', 'Permanent failure');

      expect(repo.markFailed).toHaveBeenCalledWith('e1', 'Permanent failure');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('does nothing when event not found', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue(null);
      const q = makeQueue(repo);

      await q.reject('unknown', 'Error');
      expect(repo.markFailed).not.toHaveBeenCalled();
      expect(repo.incrementAttempts).not.toHaveBeenCalled();
    });

    it('moves to DLQ when max retries reached', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue({ id: 'e1', event_id: 'evt-1', type: 'TEST', entity_id: 'e1', client_id: null, payload: '{}', attempts: 2 });
      repo.incrementAttempts.mockResolvedValue(3);
      const q = makeQueue(repo);

      await q.reject('evt-1', 'Final error');

      expect(repo.markFailed).toHaveBeenCalledWith('e1', 'Final error');
      expect(repo.moveToDlq).toHaveBeenCalledWith('evt-1', 'Final error');
    });
  });

  describe('replay', () => {
    it('replays a failed event with new eventId', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue({ id: 'e1', event_id: 'evt-original', type: 'TEST', entity_id: 'e1', client_id: 'c1', payload: '{"device":"Phone"}', status: 'failed', attempts: 3 });
      const q = makeQueue(repo);

      const result = await q.replay('evt-original');

      expect(result.replayedFrom).toBe('evt-original');
      expect(result.eventId).not.toBe('evt-original');
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'TEST',
        entityId: 'e1',
        clientId: 'c1',
      }));
    });

    it('returns null when event not found', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue(null);
      const q = makeQueue(repo);

      const result = await q.replay('unknown');
      expect(result).toBeNull();
    });

    it('returns null when event is not failed', async () => {
      const repo = makeMockRepository();
      repo.findByEventId.mockResolvedValue({ id: 'e1', event_id: 'evt-1', status: 'completed' });
      const q = makeQueue(repo);

      const result = await q.replay('evt-1');
      expect(result).toBeNull();
    });
  });

  describe('replayFromDlq', () => {
    it('replays a DLQ entry back to events table', async () => {
      const repo = makeMockRepository();
      repo.create.mockResolvedValue({ id: 'new-id' });
      const q = makeQueue(repo);

      const dlqEntry = { id: 'dlq-1', event_id: 'evt-1', type: 'REPAIR_CREATED', entity_id: 'r1', client_id: 'c1', payload: '{"k":"v"}' };
      const result = await q.replayFromDlq(dlqEntry);

      expect(result.replayedFrom).toBe('evt-1');
      expect(repo.markDlqReplayed).toHaveBeenCalledWith('dlq-1');
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'REPAIR_CREATED',
        entityId: 'r1',
        clientId: 'c1',
      }));
    });
  });

  describe('getDlq', () => {
    it('delegates to repository.getDlq', async () => {
      const repo = makeMockRepository();
      repo.getDlq.mockResolvedValue([{ id: 'd1' }]);
      const q = makeQueue(repo);

      const result = await q.getDlq(5);
      expect(repo.getDlq).toHaveBeenCalledWith(5);
      expect(result.length).toBe(1);
    });
  });

  describe('getDlqById', () => {
    it('delegates to repository.getDlqById', async () => {
      const repo = makeMockRepository();
      repo.getDlqById.mockResolvedValue({ id: 'd1' });
      const q = makeQueue(repo);

      const result = await q.getDlqById('d1');
      expect(repo.getDlqById).toHaveBeenCalledWith('d1');
      expect(result.id).toBe('d1');
    });
  });
});
