import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationMemory } from './conversation-memory.js';

describe('ConversationMemory', () => {
  let mem;

  beforeEach(() => {
    mem = new ConversationMemory();
  });

  it('starts empty', () => {
    expect(mem.conversationCount).toBe(0);
  });

  it('remember and recall values', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    expect(mem.recall('conv-1', 'device')).toBe('iPhone');
  });

  it('recall returns undefined for unknown conversation', () => {
    expect(mem.recall('nonexistent', 'key')).toBeUndefined();
  });

  it('recall returns undefined for unknown key', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    expect(mem.recall('conv-1', 'color')).toBeUndefined();
  });

  it('forget removes a key', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    mem.forget('conv-1', 'device');
    expect(mem.recall('conv-1', 'device')).toBeUndefined();
  });

  it('remember with TTL expires after timeout', async () => {
    vi.useFakeTimers();
    mem.remember('conv-1', 'temp', 'value', 100);
    expect(mem.recall('conv-1', 'temp')).toBe('value');
    vi.advanceTimersByTime(150);
    expect(mem.recall('conv-1', 'temp')).toBeUndefined();
    vi.useRealTimers();
  });

  it('remember without TTL persists indefinitely', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    expect(mem.recall('conv-1', 'device')).toBe('iPhone');
  });

  it('getConversationMemory returns all entries', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    mem.remember('conv-1', 'color', 'negro');
    const all = mem.getConversationMemory('conv-1');
    expect(all.device).toBe('iPhone');
    expect(all.color).toBe('negro');
  });

  it('getConversationMemory returns empty for unknown conv', () => {
    expect(mem.getConversationMemory('none')).toEqual({});
  });

  it('setSummary and getSummary', () => {
    mem.setSummary('conv-1', 'Cliente quiere reparar iPhone');
    expect(mem.getSummary('conv-1')).toBe('Cliente quiere reparar iPhone');
  });

  it('getSummary returns null for unknown conv', () => {
    expect(mem.getSummary('none')).toBeNull();
  });

  it('clearConversation removes all data for conversation', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    mem.setSummary('conv-1', 'summary');
    mem.clearConversation('conv-1');
    expect(mem.recall('conv-1', 'device')).toBeUndefined();
    expect(mem.getSummary('conv-1')).toBeNull();
  });

  it('clear removes all conversations', () => {
    mem.remember('conv-1', 'a', 1);
    mem.remember('conv-2', 'b', 2);
    mem.clear();
    expect(mem.conversationCount).toBe(0);
  });

  it('conversationCount returns number of conversations', () => {
    mem.remember('conv-1', 'a', 1);
    mem.remember('conv-2', 'b', 2);
    expect(mem.conversationCount).toBe(2);
  });

  it('getAllKeys returns keys for conversation', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    mem.remember('conv-1', 'color', 'negro');
    const keys = mem.getAllKeys('conv-1');
    expect(keys).toContain('device');
    expect(keys).toContain('color');
  });

  it('getAllKeys returns empty for unknown conv', () => {
    expect(mem.getAllKeys('none')).toEqual([]);
  });

  it('expired TTL entries are excluded from getConversationMemory', async () => {
    vi.useFakeTimers();
    mem.remember('conv-1', 'permanent', 'yes');
    mem.remember('conv-1', 'temporary', 'no', 100);
    vi.advanceTimersByTime(150);
    const all = mem.getConversationMemory('conv-1');
    expect(all.permanent).toBe('yes');
    expect(all.temporary).toBeUndefined();
    vi.useRealTimers();
  });

  it('storing multiple values across conversations', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    mem.remember('conv-2', 'device', 'Notebook');
    expect(mem.recall('conv-1', 'device')).toBe('iPhone');
    expect(mem.recall('conv-2', 'device')).toBe('Notebook');
  });

  it('overwrites existing key', () => {
    mem.remember('conv-1', 'device', 'iPhone');
    mem.remember('conv-1', 'device', 'iPad');
    expect(mem.recall('conv-1', 'device')).toBe('iPad');
  });
});
