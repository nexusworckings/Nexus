import { describe, it, expect } from 'vitest';
import { ContextManager } from './context-manager.js';

describe('ContextManager', () => {
  it('creates a session', () => {
    const cm = new ContextManager();
    const s = cm.createSession('s1');
    expect(s.sessionId).toBe('s1');
  });

  it('throws on duplicate session', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    expect(() => cm.createSession('s1')).toThrow('already exists');
  });

  it('gets session by id', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    expect(cm.getSession('s1')).not.toBeNull();
  });

  it('returns null for unknown session', () => {
    const cm = new ContextManager();
    expect(cm.getSession('nope')).toBeNull();
  });

  it('hasSession returns true for existing', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    expect(cm.hasSession('s1')).toBe(true);
  });

  it('hasSession returns false for missing', () => {
    const cm = new ContextManager();
    expect(cm.hasSession('nope')).toBe(false);
  });

  it('updateSession modifies fields', () => {
    const cm = new ContextManager();
    cm.createSession('s1', { clientId: 'c1' });
    cm.updateSession('s1', { currentIntent: 'repair' });
    const s = cm.getSession('s1');
    expect(s.clientId).toBe('c1');
    expect(s.currentIntent).toBe('repair');
  });

  it('updateSession returns null for unknown', () => {
    const cm = new ContextManager();
    expect(cm.updateSession('nope', {})).toBeNull();
  });

  it('addToolCall appends to history', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    cm.addToolCall('s1', 'search', { q: 'test' }, { success: true });
    const s = cm.getSession('s1');
    expect(s.toolHistory).toHaveLength(1);
    expect(s.toolHistory[0].toolName).toBe('search');
  });

  it('addToolCall does nothing for unknown session', () => {
    const cm = new ContextManager();
    expect(() => cm.addToolCall('nope', 't', {}, {})).not.toThrow();
  });

  it('addMessage appends to conversation history', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    cm.addMessage('s1', 'user', 'hello');
    cm.addMessage('s1', 'assistant', 'hi');
    const s = cm.getSession('s1');
    expect(s.conversationHistory).toHaveLength(2);
    expect(s.conversationHistory[0].role).toBe('user');
  });

  it('addMessage does nothing for unknown session', () => {
    const cm = new ContextManager();
    expect(() => cm.addMessage('nope', 'user', 'hi')).not.toThrow();
  });

  it('setWorkingMemory stores a value', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    cm.setWorkingMemory('s1', 'device', 'iPhone');
    expect(cm.getWorkingMemory('s1', 'device')).toBe('iPhone');
  });

  it('getWorkingMemory returns all when no key', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    cm.setWorkingMemory('s1', 'a', 1);
    cm.setWorkingMemory('s1', 'b', 2);
    expect(cm.getWorkingMemory('s1')).toEqual({ a: 1, b: 2 });
  });

  it('getWorkingMemory returns undefined for missing key', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    expect(cm.getWorkingMemory('s1', 'nope')).toBeUndefined();
  });

  it('deleteSession removes session', () => {
    const cm = new ContextManager();
    cm.createSession('s1');
    expect(cm.deleteSession('s1')).toBe(true);
    expect(cm.hasSession('s1')).toBe(false);
  });

  it('listSessions returns all keys', () => {
    const cm = new ContextManager();
    cm.createSession('a');
    cm.createSession('b');
    const keys = cm.listSessions();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });

  it('count returns number of sessions', () => {
    const cm = new ContextManager();
    expect(cm.count()).toBe(0);
    cm.createSession('a');
    expect(cm.count()).toBe(1);
  });

  it('clear removes all sessions', () => {
    const cm = new ContextManager();
    cm.createSession('a');
    cm.createSession('b');
    cm.clear();
    expect(cm.count()).toBe(0);
  });

  it('initial data is passed through', () => {
    const cm = new ContextManager();
    const s = cm.createSession('s1', {
      clientId: 'c1',
      repairId: 'r1',
      currentIntent: 'repair',
      conversationId: 'conv1',
    });
    expect(s.clientId).toBe('c1');
    expect(s.repairId).toBe('r1');
    expect(s.currentIntent).toBe('repair');
    expect(s.conversationId).toBe('conv1');
  });
});
