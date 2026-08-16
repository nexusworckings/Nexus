import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStore } from './session-store.js';
import { MemorySessionStore } from './stores/memory-session-store.js';
import { StateKeeper } from './state-keeper.js';
import { deepFreeze } from './utils.js';

const TEST_ID = 'test-session-id';

function createTestData(overrides = {}) {
  const state = StateKeeper.create('svc', '1.0.0');
  return {
    state,
    schema: {
      serviceId: 'svc',
      serviceVersion: '1.0.0',
      fields: [
        { id: 'name', type: 'text', label: 'Name', question: '?' },
      ],
    },
    sessionId: state.getInterviewId(),
    ...overrides,
  };
}

describe('SessionStore (abstract)', () => {
  let store;

  beforeEach(() => {
    store = new SessionStore();
  });

  it('is a class', () => {
    expect(SessionStore).toBeInstanceOf(Function);
  });

  it('create throws not implemented', () => {
    expect(() => store.create('id', {})).toThrow('not implemented');
  });

  it('get throws not implemented', () => {
    expect(() => store.get('id')).toThrow('not implemented');
  });

  it('update throws not implemented', () => {
    expect(() => store.update('id', {})).toThrow('not implemented');
  });

  it('delete throws not implemented', () => {
    expect(() => store.delete('id')).toThrow('not implemented');
  });

  it('exists throws not implemented', () => {
    expect(() => store.exists('id')).toThrow('not implemented');
  });
});

describe('MemorySessionStore', () => {
  let store;

  beforeEach(() => {
    store = new MemorySessionStore();
  });

  it('extends SessionStore', () => {
    expect(store).toBeInstanceOf(SessionStore);
  });

  it('create stores a session', () => {
    const { state, schema, sessionId } = createTestData();
    store.create(sessionId, { state, schema });
    expect(store.exists(sessionId)).toBe(true);
  });

  it('get retrieves a stored session', () => {
    const { state, schema, sessionId } = createTestData();
    store.create(sessionId, { state, schema });
    const result = store.get(sessionId);
    expect(result).toBeTruthy();
    expect(result.state).toBe(state);
    expect(result.schema.serviceId).toBe('svc');
  });

  it('get returns undefined for unknown sessionId', () => {
    const result = store.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('get deep freezes the schema on read', () => {
    const { state, schema, sessionId } = createTestData();
    store.create(sessionId, { state, schema });
    const result = store.get(sessionId);
    expect(Object.isFrozen(result.schema)).toBe(true);
  });

  it('get deep freezes nested schema objects', () => {
    const { state, sessionId } = createTestData();
    store.create(sessionId, { state, schema: { fields: [{ id: 'x', options: [{ value: 'a' }] }] } });
    const result = store.get(sessionId);
    expect(Object.isFrozen(result.schema.fields[0].options[0])).toBe(true);
  });

  it('create deep clones schema (external mutations do not affect store)', () => {
    const data = createTestData();
    const schema = data.schema;
    store.create(data.sessionId, { state: data.state, schema });
    schema.serviceId = 'hacked';
    const result = store.get(data.sessionId);
    expect(result.schema.serviceId).toBe('svc');
  });

  it('gets data is independent across calls (same schema shape)', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    const r1 = store.get(data.sessionId);
    const r2 = store.get(data.sessionId);
    expect(r1.schema.fields).toHaveLength(1);
    expect(r2.schema.fields).toHaveLength(1);
  });

  it('create overwrites existing session with same sessionId', () => {
    const d1 = createTestData();
    store.create(d1.sessionId, { state: d1.state, schema: d1.schema });
    const state2 = StateKeeper.create('svc2', '2.0.0');
    store.create(d1.sessionId, { state: state2, schema: { serviceId: 'svc2' } });
    const result = store.get(d1.sessionId);
    expect(result.schema.serviceId).toBe('svc2');
    expect(result.state.getServiceId()).toBe('svc2');
  });

  it('update modifies stored schema', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    const updated = store.update(data.sessionId, { schema: { serviceId: 'updated' } });
    expect(updated).toBe(true);
    const result = store.get(data.sessionId);
    expect(result.schema.serviceId).toBe('updated');
  });

  it('update replaces stored state', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    const newState = StateKeeper.create('new', '1.0.0');
    store.update(data.sessionId, { state: newState });
    const result = store.get(data.sessionId);
    expect(result.state).toBe(newState);
  });

  it('update returns false for non-existent session', () => {
    const result = store.update('nonexistent', { schema: {} });
    expect(result).toBe(false);
  });

  it('update deep clones schema on write', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    const newSchema = { serviceId: 'original' };
    store.update(data.sessionId, { schema: newSchema });
    newSchema.serviceId = 'mutated';
    const result = store.get(data.sessionId);
    expect(result.schema.serviceId).toBe('original');
  });

  it('delete removes session', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    expect(store.exists(data.sessionId)).toBe(true);
    store.delete(data.sessionId);
    expect(store.exists(data.sessionId)).toBe(false);
  });

  it('delete returns true for existing session', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    const result = store.delete(data.sessionId);
    expect(result).toBe(true);
  });

  it('delete returns false for non-existing session', () => {
    const result = store.delete('nonexistent');
    expect(result).toBe(false);
  });

  it('exists returns true for existing session', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    expect(store.exists(data.sessionId)).toBe(true);
  });

  it('exists returns false for non-existing session', () => {
    expect(store.exists('nonexistent')).toBe(false);
  });

  it('handles multiple independent sessions', () => {
    const d1 = createTestData();
    const state2 = StateKeeper.create('svc', '1.0.0');
    const d2 = { sessionId: state2.getInterviewId(), state: state2, schema: { serviceId: 'second' } };
    store.create(d1.sessionId, { state: d1.state, schema: d1.schema });
    store.create(d2.sessionId, { state: d2.state, schema: d2.schema });
    expect(store.exists(d1.sessionId)).toBe(true);
    expect(store.exists(d2.sessionId)).toBe(true);
    expect(store.get(d1.sessionId).schema.serviceId).toBe('svc');
    expect(store.get(d2.sessionId).schema.serviceId).toBe('second');
  });

  it('get returns state that retains StateKeeper methods', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    const result = store.get(data.sessionId);
    expect(typeof result.state.setUserValue).toBe('function');
    expect(typeof result.state.isFieldCompleted).toBe('function');
    expect(typeof result.state.toJSON).toBe('function');
    expect(typeof result.state.getInterviewId).toBe('function');
  });

  it('state mutations via retrieved reference are reflected', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    const result = store.get(data.sessionId);
    result.state.setUserValue('name', 'John');
    const result2 = store.get(data.sessionId);
    expect(result2.state.getFieldValue('name')).toBe('John');
  });

  it('delete one session does not affect others', () => {
    const d1 = createTestData();
    const state2 = StateKeeper.create('svc', '1.0.0');
    const d2 = { sessionId: state2.getInterviewId(), state: state2, schema: { serviceId: 'second' } };
    store.create(d1.sessionId, { state: d1.state, schema: d1.schema });
    store.create(d2.sessionId, { state: d2.state, schema: d2.schema });
    store.delete(d1.sessionId);
    expect(store.exists(d1.sessionId)).toBe(false);
    expect(store.exists(d2.sessionId)).toBe(true);
  });

  it('update with partial data does not clear other fields', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    store.update(data.sessionId, { schema: { extra: 'added' } });
    const result = store.get(data.sessionId);
    expect(result.schema).toEqual({ extra: 'added' });
  });

  it('update with empty object does not change stored data', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    store.update(data.sessionId, {});
    const result = store.get(data.sessionId);
    expect(result.state.getServiceId()).toBe('svc');
    expect(result.schema.serviceId).toBe('svc');
  });

  it('get returns undefined after delete', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: data.schema });
    store.delete(data.sessionId);
    expect(store.get(data.sessionId)).toBeUndefined();
  });

  it('create with null fields in schema is handled', () => {
    const state = StateKeeper.create('svc', '1.0.0');
    const schema = { serviceId: 'svc', fields: null };
    store.create(state.getInterviewId(), { state, schema });
    const result = store.get(state.getInterviewId());
    expect(result.schema.fields).toBeNull();
  });

  it('get returns schema that is deeply frozen at all levels', () => {
    const data = createTestData();
    store.create(data.sessionId, { state: data.state, schema: { fields: [{ id: 'f1', options: [{ value: 'a' }] }] } });
    const result = store.get(data.sessionId);
    expect(Object.isFrozen(result.schema)).toBe(true);
    expect(Object.isFrozen(result.schema.fields)).toBe(true);
    expect(Object.isFrozen(result.schema.fields[0])).toBe(true);
    expect(Object.isFrozen(result.schema.fields[0].options)).toBe(true);
    expect(Object.isFrozen(result.schema.fields[0].options[0])).toBe(true);
  });

  it('constructs without arguments', () => {
    const s = new MemorySessionStore();
    expect(s).toBeInstanceOf(MemorySessionStore);
  });
});
