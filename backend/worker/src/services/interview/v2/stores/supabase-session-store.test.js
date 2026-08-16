import { describe, it, expect, vi } from 'vitest';
import { SupabaseSessionStore, StoreError } from './supabase-session-store.js';
import { SessionStore } from '../session-store.js';
import { StateKeeper } from '../state-keeper.js';

// ── Mock factory ────────────────────────────────────────────────

function createMockSupabase(rows = []) {
  const stored = new Map();

  for (const row of rows) {
    stored.set(row.id, { ...row });
  }

  const mock = {
    from: vi.fn(() => mockQuery),
    _stored: stored,
    _table: null,
  };

  const mockQuery = {
    insert: vi.fn((data) => {
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        stored.set(item.id, { ...item });
      }
      return { data: items, error: null, select: vi.fn(() => ({ data: items, error: null, single: vi.fn(() => ({ data: items[0], error: null })) })) };
    }),
    select: vi.fn((cols) => {
      return {
        eq: vi.fn((col, val) => {
          const entry = stored.get(val) || null;
          return {
            maybeSingle: vi.fn(() => {
              if (entry && cols === 'id') return { data: { id: entry.id }, error: null };
              return { data: entry ? { ...entry } : null, error: null };
            }),
            single: vi.fn(() => {
              if (!entry) return { data: null, error: { message: 'Not found', code: 'PGRST116' } };
              return { data: { ...entry }, error: null };
            }),
          };
        }),
      };
    }),
    update: vi.fn((updates) => ({
      eq: vi.fn((col, val) => {
        const entry = stored.get(val);
        if (entry) {
          Object.assign(entry, updates);
        }
        return {
          select: vi.fn(() => ({
            maybeSingle: vi.fn(() => {
              const updated = stored.get(val);
              return { data: updated ? { ...updated } : null, error: null };
            }),
          })),
        };
      }),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn((col, val) => {
        stored.delete(val);
        return { error: null };
      }),
    })),
  };

  return mock;
}

// ── Helpers ─────────────────────────────────────────────────────

function createTestData() {
  const state = StateKeeper.create('test-svc', '1.0.0');
  const schema = {
    serviceId: 'test-svc',
    serviceVersion: '1.0.0',
    fields: [{ id: 'name', type: 'text', label: 'Name', question: '?' }],
  };
  return {
    state,
    schema,
    sessionId: state.getInterviewId(),
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('SupabaseSessionStore', () => {
  describe('constructor', () => {
    it('creates store with supabase client', () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      expect(store).toBeInstanceOf(SupabaseSessionStore);
      expect(store).toBeInstanceOf(SessionStore);
    });

    it('throws StoreError when supabase client is missing', () => {
      expect(() => new SupabaseSessionStore()).toThrow(StoreError);
      expect(() => new SupabaseSessionStore()).toThrow('Supabase client is required');
    });

    it('accepts custom table name', () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase, { tableName: 'custom_sessions' });
      expect(store).toBeInstanceOf(SupabaseSessionStore);
    });
  });

  describe('create', () => {
    it('inserts session into supabase', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();

      await store.create(data.sessionId, { state: data.state, schema: data.schema });

      expect(supabase.from).toHaveBeenCalledWith('interview_sessions');
    });

    it('inserts correct row structure', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();
      const spy = vi.spyOn(supabase, 'from');

      await store.create(data.sessionId, { state: data.state, schema: data.schema });

      const insertCall = spy.mock.results[0].value.insert;
      expect(insertCall).toHaveBeenCalled();
      const insertedRow = insertCall.mock.calls[0][0];
      expect(insertedRow.id).toBe(data.sessionId);
      expect(insertedRow.schema_id).toBe('test-svc');
      expect(insertedRow.status).toBe('active');
      expect(insertedRow.state).toBeDefined();
      expect(insertedRow.schema).toBeDefined();
    });

    it('serializes state via toJSON', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();
      const toJSONSpy = vi.spyOn(data.state, 'toJSON');

      await store.create(data.sessionId, { state: data.state, schema: data.schema });

      expect(toJSONSpy).toHaveBeenCalled();
    });

    it('deep clones schema (external mutations do not affect stored)', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();
      const schema = { serviceId: 'original', fields: [] };

      await store.create(data.sessionId, { state: data.state, schema });
      schema.serviceId = 'hacked';

      const { data: storedRow } = await supabase
        .from('interview_sessions')
        .select('*')
        .eq('id', data.sessionId)
        .maybeSingle();

      expect(storedRow.schema.serviceId).toBe('original');
    });

    it('returns frozen result', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();

      const result = await store.create(data.sessionId, { state: data.state, schema: data.schema });

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.schema)).toBe(true);
    });

    it('caches session after create', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();

      await store.create(data.sessionId, { state: data.state, schema: data.schema });
      const fromCallCount = supabase.from.mock.calls.length;

      const cached = await store.get(data.sessionId);

      expect(cached).toBeTruthy();
      expect(cached.state.getInterviewId()).toBe(data.sessionId);
    });

    it('handles supabase insert error', async () => {
      const supabase = createMockSupabase();
      supabase.from = vi.fn(() => ({
        insert: vi.fn(() => ({ error: { message: 'duplicate key' }, select: vi.fn() })),
      }));
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();

      await expect(
        store.create(data.sessionId, { state: data.state, schema: data.schema })
      ).rejects.toThrow(StoreError);
    });

    it('insert error provides DATABASE_ERROR code', async () => {
      const supabase = createMockSupabase();
      supabase.from = vi.fn(() => ({
        insert: vi.fn(() => ({ error: { message: 'timeout' }, select: vi.fn() })),
      }));
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();

      try {
        await store.create(data.sessionId, { state: data.state, schema: data.schema });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.code).toBe('DATABASE_ERROR');
      }
    });

    it('uses custom table name for insert', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase, { tableName: 'custom_table' });
      const data = createTestData();

      await store.create(data.sessionId, { state: data.state, schema: data.schema });

      expect(supabase.from).toHaveBeenCalledWith('custom_table');
    });
  });

  describe('get', () => {
    it('returns session data for existing session', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.get(data.sessionId);

      expect(result).toBeTruthy();
      expect(result.state).toBeDefined();
      expect(result.schema).toBeDefined();
    });

    it('returns status from DB row', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'completed', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.get(data.sessionId);

      expect(result.status).toBe('completed');
    });

    it('returns status from cache after create', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);
      const data = createTestData();

      await store.create(data.sessionId, { state: data.state, schema: data.schema });
      const cached = await store.get(data.sessionId);

      expect(cached.status).toBe('active');
    });

    it('returns status from cache after first load', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'completed', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);
      supabase.from.mockClear();

      const cached = await store.get(data.sessionId);

      expect(cached.status).toBe('completed');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns null for non-existing session', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);

      const result = await store.get('nonexistent');

      expect(result).toBeNull();
    });

    it('queries supabase with correct id', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);

      expect(supabase.from).toHaveBeenCalledWith('interview_sessions');
    });

    it('returns state as StateKeeper instance with methods', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.get(data.sessionId);

      expect(typeof result.state.setUserValue).toBe('function');
      expect(typeof result.state.isFieldCompleted).toBe('function');
      expect(typeof result.state.toJSON).toBe('function');
      expect(typeof result.state.getInterviewId).toBe('function');
    });

    it('returns deep frozen schema', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.get(data.sessionId);

      expect(Object.isFrozen(result.schema)).toBe(true);
    });

    it('deep freezes nested schema objects', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const schema = { fields: [{ id: 'f1', options: [{ value: 'a' }] }] };
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.get(data.sessionId);

      expect(Object.isFrozen(result.schema)).toBe(true);
      expect(Object.isFrozen(result.schema.fields)).toBe(true);
      expect(Object.isFrozen(result.schema.fields[0])).toBe(true);
      expect(Object.isFrozen(result.schema.fields[0].options)).toBe(true);
      expect(Object.isFrozen(result.schema.fields[0].options[0])).toBe(true);
    });

    it('caches session after first load (subsequent get skips DB)', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);
      const callCount = supabase.from.mock.calls.length;

      await store.get(data.sessionId);

      expect(supabase.from.mock.calls.length).toBe(callCount);
    });

    it('mutations on returned state affect cache', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const r1 = await store.get(data.sessionId);
      r1.state.setUserValue('name', 'John');

      const r2 = await store.get(data.sessionId);
      expect(r2.state.getFieldValue('name')).toBe('John');
    });

    it('handles supabase select error', async () => {
      const supabase = createMockSupabase();
      supabase.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({ data: null, error: { message: 'connection failed' } })),
          })),
        })),
      }));
      const store = new SupabaseSessionStore(supabase);

      await expect(store.get('any-id')).rejects.toThrow(StoreError);
    });

    it('reconstructs correct state from stored JSON', async () => {
      const data = createTestData();
      data.state.setUserValue('name', 'test-value');
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.get(data.sessionId);

      expect(result.state.getFieldValue('name')).toBe('test-value');
    });
  });

  describe('update', () => {
    it('updates state in supabase', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);
      const newState = StateKeeper.create('test-svc', '1.0.0');

      const result = await store.update(data.sessionId, { state: newState });

      expect(result).toBeTruthy();
      expect(result.state.getInterviewId()).toBe(newState.getInterviewId());
    });

    it('updates schema in supabase', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);
      const newSchema = { serviceId: 'updated-svc', fields: [] };

      const result = await store.update(data.sessionId, { schema: newSchema });

      expect(result).toBeTruthy();
      expect(result.schema.serviceId).toBe('updated-svc');
    });

    it('returns null for non-existing session', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);

      const result = await store.update('nonexistent', { state: StateKeeper.create('s', '1') });

      expect(result).toBeNull();
    });

    it('handles supabase update error', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      supabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(() => ({ data: null, error: { message: 'update failed' } })),
            })),
          })),
        })),
      }));
      const store = new SupabaseSessionStore(supabase);

      await expect(
        store.update(data.sessionId, { state: StateKeeper.create('s', '1') })
      ).rejects.toThrow(StoreError);
    });

    it('returns frozen result', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.update(data.sessionId, { schema: { serviceId: 'x' } });

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.schema)).toBe(true);
    });

    it('partial update with only state', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);
      const newState = StateKeeper.create('test-svc', '1.0.0');

      const result = await store.update(data.sessionId, { state: newState });

      expect(result.state.getInterviewId()).toBe(newState.getInterviewId());
      expect(result.schema.serviceId).toBe('test-svc');
    });

    it('partial update with only schema', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.update(data.sessionId, { schema: { serviceId: 'new-svc', fields: [] } });

      expect(result.schema.serviceId).toBe('new-svc');
    });

    it('updates local cache after update', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);
      await store.update(data.sessionId, { schema: { serviceId: 'cached-update' } });

      const cached = await store.get(data.sessionId);
      expect(cached.schema.serviceId).toBe('cached-update');
    });
  });

  describe('markCompleted', () => {
    it('updates status to completed in supabase', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.markCompleted(data.sessionId);

      expect(result).toBeTruthy();
      expect(result.status).toBe('completed');
      const { data: storedRow } = await supabase
        .from('interview_sessions')
        .select('*')
        .eq('id', data.sessionId)
        .maybeSingle();
      expect(storedRow.status).toBe('completed');
    });

    it('updates cache status after markCompleted', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);
      await store.markCompleted(data.sessionId);

      const cached = await store.get(data.sessionId);
      expect(cached.status).toBe('completed');
    });

    it('returns null for non-existing session', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);

      const result = await store.markCompleted('nonexistent');

      expect(result).toBeNull();
    });

    it('handles supabase update error', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      supabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(() => ({ data: null, error: { message: 'update failed' } })),
            })),
          })),
        })),
      }));
      const store = new SupabaseSessionStore(supabase);

      await expect(store.markCompleted(data.sessionId)).rejects.toThrow(StoreError);
    });
  });

  describe('delete', () => {
    it('removes session from supabase', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.delete(data.sessionId);

      const exists = await store.exists(data.sessionId);
      expect(exists).toBe(false);
    });

    it('clears local cache', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);
      await store.delete(data.sessionId);

      const afterDelete = await store.get(data.sessionId);
      expect(afterDelete).toBeNull();
    });

    it('handles supabase delete error', async () => {
      const supabase = createMockSupabase();
      supabase.from = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({ error: { message: 'delete failed' } })),
        })),
      }));
      const store = new SupabaseSessionStore(supabase);

      await expect(store.delete('any-id')).rejects.toThrow(StoreError);
    });

    it('returns true on success', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.delete(data.sessionId);
      expect(result).toBe(true);
    });

    it('succeeds even if session not cached', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.delete(data.sessionId);
      expect(result).toBe(true);
    });
  });

  describe('exists', () => {
    it('returns true for cached session', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);
      const result = await store.exists(data.sessionId);

      expect(result).toBe(true);
    });

    it('returns true for DB-only session (cache miss)', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      const result = await store.exists(data.sessionId);

      expect(result).toBe(true);
    });

    it('returns false for non-existing session', async () => {
      const supabase = createMockSupabase();
      const store = new SupabaseSessionStore(supabase);

      const result = await store.exists('nonexistent');

      expect(result).toBe(false);
    });

    it('handles supabase error', async () => {
      const supabase = createMockSupabase();
      supabase.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => ({ data: null, error: { message: 'query failed' } })),
          })),
        })),
      }));
      const store = new SupabaseSessionStore(supabase);

      await expect(store.exists('any-id')).rejects.toThrow(StoreError);
    });

    it('does not query DB if session is in cache', async () => {
      const data = createTestData();
      const stateJson = data.state.toJSON();
      const supabase = createMockSupabase([
        { id: data.sessionId, schema_id: 'test-svc', status: 'active', state: stateJson, schema: data.schema },
      ]);
      const store = new SupabaseSessionStore(supabase);

      await store.get(data.sessionId);
      supabase.from.mockClear();

      const result = await store.exists(data.sessionId);

      expect(result).toBe(true);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });
});
