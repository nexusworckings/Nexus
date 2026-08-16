import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventRepository } from './event-repository.js';

function makeDeps() {
  return {
    insertFn: vi.fn(async (table, data) => ({ ...data })),
    queryFn: vi.fn(),
    updateFn: vi.fn(),
  };
}

describe('EventRepository', () => {
  describe('constructor', () => {
    it('rejects missing insertFn', () => {
      expect(() => new EventRepository({ queryFn: async () => {} })).toThrow('insertFn is required');
    });

    it('rejects missing queryFn', () => {
      expect(() => new EventRepository({ insertFn: async () => {} })).toThrow('queryFn is required');
    });

    it('accepts valid options', () => {
      const repo = new EventRepository({ insertFn: async () => {}, queryFn: async () => {} });
      expect(repo).toBeInstanceOf(EventRepository);
    });
  });

  describe('create', () => {
    it('inserts event record', async () => {
      const deps = makeDeps();
      const repo = new EventRepository(deps);

      await repo.create({
        id: 'evt-1',
        eventId: 'uuid-123',
        type: 'REPAIR_CREATED',
        entityId: 'repair-1',
        clientId: 'client-1',
        metadata: { device: 'Phone' },
      });

      expect(deps.insertFn).toHaveBeenCalledWith('events', {
        id: 'evt-1',
        event_id: 'uuid-123',
        type: 'REPAIR_CREATED',
        entity_id: 'repair-1',
        client_id: 'client-1',
        payload: '{"device":"Phone"}',
        status: 'pending',
        attempts: 0,
      });
    });

    it('accepts null entityId and clientId', async () => {
      const deps = makeDeps();
      const repo = new EventRepository(deps);

      await repo.create({
        id: 'evt-2',
        eventId: 'uuid-456',
        type: 'TEST',
        entityId: null,
        clientId: null,
        metadata: {},
      });

      expect(deps.insertFn).toHaveBeenCalledWith('events', expect.objectContaining({
        entity_id: null,
        client_id: null,
      }));
    });
  });

  describe('findByEventId', () => {
    it('returns event when found', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'evt-1', event_id: 'uuid-123', type: 'TEST' }]);
      const repo = new EventRepository(deps);

      const result = await repo.findByEventId('uuid-123');
      expect(result.id).toBe('evt-1');
      expect(deps.queryFn).toHaveBeenCalledWith('events', { eq: { event_id: 'uuid-123' }, limit: 1 });
    });

    it('returns null when not found', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const repo = new EventRepository(deps);

      const result = await repo.findByEventId('unknown');
      expect(result).toBeNull();
    });

    it('returns null on query error', async () => {
      const deps = makeDeps();
      deps.queryFn.mockRejectedValue(new Error('DB error'));
      const repo = new EventRepository(deps);

      const result = await repo.findByEventId('uuid-123');
      expect(result).toBeNull();
    });
  });

  describe('getPending', () => {
    it('returns pending events ordered by created_at', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'e1', type: 'TEST' }]);
      const repo = new EventRepository(deps);

      const result = await repo.getPending(5);
      expect(result.length).toBe(1);
      expect(deps.queryFn).toHaveBeenCalledWith('events', {
        eq: { status: 'pending' },
        order: 'created_at.asc',
        limit: 5,
      });
    });

    it('returns empty array on query error', async () => {
      const deps = makeDeps();
      deps.queryFn.mockRejectedValue(new Error('DB error'));
      const repo = new EventRepository(deps);

      const result = await repo.getPending();
      expect(result).toEqual([]);
    });

    it('defaults limit to 10', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const repo = new EventRepository(deps);

      await repo.getPending();
      expect(deps.queryFn).toHaveBeenCalledWith('events', {
        eq: { status: 'pending' },
        order: 'created_at.asc',
        limit: 10,
      });
    });
  });

  describe('markProcessing', () => {
    it('updates event status to processing', async () => {
      const deps = makeDeps();
      const repo = new EventRepository(deps);

      await repo.markProcessing('evt-1');
      expect(deps.updateFn).toHaveBeenCalledWith('events', 'evt-1', { status: 'processing' });
    });
  });

  describe('markCompleted', () => {
    it('updates event status to completed with processed_at', async () => {
      const deps = makeDeps();
      const repo = new EventRepository(deps);

      await repo.markCompleted('evt-1');
      expect(deps.updateFn).toHaveBeenCalledWith('events', 'evt-1', {
        status: 'completed',
        processed_at: expect.any(String),
      });
    });
  });

  describe('markFailed', () => {
    it('updates event status to failed with error message', async () => {
      const deps = makeDeps();
      const repo = new EventRepository(deps);

      await repo.markFailed('evt-1', 'Connection failed');
      expect(deps.updateFn).toHaveBeenCalledWith('events', 'evt-1', {
        status: 'failed',
        error_message: 'Connection failed',
      });
    });
  });

  describe('incrementAttempts', () => {
    it('increments attempts count', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'evt-1', attempts: 2 }]);
      const repo = new EventRepository(deps);

      const result = await repo.incrementAttempts('evt-1');
      expect(result).toBe(3);
      expect(deps.updateFn).toHaveBeenCalledWith('events', 'evt-1', { attempts: 3 });
    });

    it('starts at 0 when no previous attempts', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'evt-1' }]);
      const repo = new EventRepository(deps);

      const result = await repo.incrementAttempts('evt-1');
      expect(result).toBe(1);
    });

    it('returns 0 on error', async () => {
      const deps = makeDeps();
      deps.queryFn.mockRejectedValue(new Error('DB error'));
      const repo = new EventRepository(deps);

      const result = await repo.incrementAttempts('evt-1');
      expect(result).toBe(0);
    });
  });

  describe('getFailed', () => {
    it('returns failed events ordered by created_at desc', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'e1', status: 'failed' }]);
      const repo = new EventRepository(deps);

      const result = await repo.getFailed(20);
      expect(deps.queryFn).toHaveBeenCalledWith('events', {
        eq: { status: 'failed' },
        order: 'created_at.desc',
        limit: 20,
      });
      expect(result.length).toBe(1);
    });

    it('defaults limit to 50', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const repo = new EventRepository(deps);

      await repo.getFailed();
      expect(deps.queryFn).toHaveBeenCalledWith('events', expect.objectContaining({ limit: 50 }));
    });
  });

  describe('moveToDlq', () => {
    it('moves event to DLQ table', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'e1', event_id: 'evt-1', type: 'TEST', entity_id: 'e1', client_id: 'c1', payload: '{"k":"v"}', attempts: 2 }]);
      const repo = new EventRepository(deps);

      const result = await repo.moveToDlq('evt-1', 'Timeout error');

      expect(deps.insertFn).toHaveBeenCalledWith('event_dlq', expect.objectContaining({
        event_id: 'evt-1',
        type: 'TEST',
        error_message: 'Timeout error',
        status: 'failed',
      }));
      expect(result).not.toBeNull();
      expect(result.event_id).toBe('evt-1');
    });

    it('returns null when event not found', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const repo = new EventRepository(deps);

      const result = await repo.moveToDlq('unknown', 'Error');
      expect(result).toBeNull();
    });
  });

  describe('getDlq', () => {
    it('returns DLQ entries ordered by failed_at desc', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'd1', status: 'failed', type: 'TEST' }]);
      const repo = new EventRepository(deps);

      const result = await repo.getDlq(10);
      expect(deps.queryFn).toHaveBeenCalledWith('event_dlq', {
        eq: { status: 'failed' },
        order: 'failed_at.desc',
        limit: 10,
      });
      expect(result.length).toBe(1);
    });

    it('defaults limit to 50', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const repo = new EventRepository(deps);

      await repo.getDlq();
      expect(deps.queryFn).toHaveBeenCalledWith('event_dlq', expect.objectContaining({ limit: 50 }));
    });
  });

  describe('getDlqById', () => {
    it('returns DLQ entry by id', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([{ id: 'd1', type: 'TEST', status: 'failed' }]);
      const repo = new EventRepository(deps);

      const result = await repo.getDlqById('d1');
      expect(result.id).toBe('d1');
    });

    it('returns null when not found', async () => {
      const deps = makeDeps();
      deps.queryFn.mockResolvedValue([]);
      const repo = new EventRepository(deps);

      const result = await repo.getDlqById('unknown');
      expect(result).toBeNull();
    });
  });

  describe('markDlqReplayed', () => {
    it('marks DLQ entry as replayed', async () => {
      const deps = makeDeps();
      const repo = new EventRepository(deps);

      await repo.markDlqReplayed('d1');
      expect(deps.updateFn).toHaveBeenCalledWith('event_dlq', 'd1', expect.objectContaining({
        status: 'replayed',
        replayed_at: expect.any(String),
      }));
    });
  });

  describe('removeFromDlq', () => {
    it('marks DLQ entry as purged', async () => {
      const deps = makeDeps();
      const repo = new EventRepository(deps);

      await repo.removeFromDlq('d1');
      expect(deps.updateFn).toHaveBeenCalledWith('event_dlq', 'd1', { status: 'purged' });
    });
  });
});
