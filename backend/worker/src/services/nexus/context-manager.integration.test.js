import { describe, it, expect } from 'vitest';
import { ContextManager } from './context-manager.js';

describe('ContextManager Integration', () => {
  it('preserves full session lifecycle', () => {
    const cm = new ContextManager();
    cm.createSession('lifecycle', { clientId: 'c1' });
    expect(cm.hasSession('lifecycle')).toBe(true);

    cm.updateSession('lifecycle', { currentIntent: 'repair' });
    expect(cm.getSession('lifecycle').currentIntent).toBe('repair');

    cm.addMessage('lifecycle', 'user', 'hello');
    cm.addMessage('lifecycle', 'assistant', 'hi');
    expect(cm.getSession('lifecycle').conversationHistory).toHaveLength(2);

    cm.addToolCall('lifecycle', 'searchClient', { q: 'test' }, { success: true });
    expect(cm.getSession('lifecycle').toolHistory).toHaveLength(1);

    cm.setWorkingMemory('lifecycle', 'device', 'iPhone');
    expect(cm.getWorkingMemory('lifecycle', 'device')).toBe('iPhone');

    cm.deleteSession('lifecycle');
    expect(cm.hasSession('lifecycle')).toBe(false);
  });

  it('manages multiple sessions independently', () => {
    const cm = new ContextManager();
    cm.createSession('s1', { clientId: 'c1' });
    cm.createSession('s2', { clientId: 'c2' });

    cm.setWorkingMemory('s1', 'device', 'iPhone');
    cm.setWorkingMemory('s2', 'device', 'iPad');

    expect(cm.getWorkingMemory('s1', 'device')).toBe('iPhone');
    expect(cm.getWorkingMemory('s2', 'device')).toBe('iPad');
  });

  it('updates updatedAt on changes', () => {
    const cm = new ContextManager();
    cm.createSession('time-test');
    const created = cm.getSession('time-test').updatedAt;

    cm.addMessage('time-test', 'user', 'test');
    const updated = cm.getSession('time-test').updatedAt;
    expect(updated).not.toBe(created);
  });

  it('stores all entity types', () => {
    const cm = new ContextManager();
    const s = cm.createSession('entities', {
      clientId: 'c1',
      repairId: 'r1',
      budgetId: 'b1',
      printOrderId: 'p1',
      conversationId: 'conv1',
    });
    expect(s.clientId).toBe('c1');
    expect(s.repairId).toBe('r1');
    expect(s.budgetId).toBe('b1');
    expect(s.printOrderId).toBe('p1');
    expect(s.conversationId).toBe('conv1');
  });

  it('updateSession merges partial updates', () => {
    const cm = new ContextManager();
    cm.createSession('merge', { clientId: 'c1', entities: { name: 'Juan' } });
    cm.updateSession('merge', { currentIntent: 'repair' });
    const s = cm.getSession('merge');
    expect(s.clientId).toBe('c1');
    expect(s.currentIntent).toBe('repair');
  });

  it('clear removes all sessions', () => {
    const cm = new ContextManager();
    cm.createSession('a');
    cm.createSession('b');
    cm.createSession('c');
    expect(cm.count()).toBe(3);
    cm.clear();
    expect(cm.count()).toBe(0);
  });

  it('listSessions returns correct keys after delete', () => {
    const cm = new ContextManager();
    cm.createSession('keep');
    cm.createSession('remove');
    cm.deleteSession('remove');
    const keys = cm.listSessions();
    expect(keys).toContain('keep');
    expect(keys).not.toContain('remove');
  });

  it('getWorkingMemory returns all when no key specified', () => {
    const cm = new ContextManager();
    cm.createSession('all-wm');
    cm.setWorkingMemory('all-wm', 'a', 1);
    cm.setWorkingMemory('all-wm', 'b', 2);
    expect(cm.getWorkingMemory('all-wm')).toEqual({ a: 1, b: 2 });
  });

  it('getWorkingMemory returns undefined for missing session', () => {
    const cm = new ContextManager();
    expect(cm.getWorkingMemory('ghost', 'key')).toBeUndefined();
  });

  it('setWorkingMemory does nothing for missing session', () => {
    const cm = new ContextManager();
    expect(() => cm.setWorkingMemory('ghost', 'k', 'v')).not.toThrow();
  });
});
