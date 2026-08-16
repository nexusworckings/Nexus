import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager } from './conversation-manager.js';
import { ConversationMemory } from './conversation-memory.js';
import { ConversationSearch } from './conversation-search.js';
import { ConversationSession } from './conversation-session.js';

describe('Conversation System Integration', () => {
  let cm, mem, cs;

  beforeEach(() => {
    cm = new ConversationManager();
    mem = new ConversationMemory();
    cs = new ConversationSearch(cm, mem);
  });

  it('creates conversation and stores in memory', () => {
    const conv = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    mem.remember('c1', 'device', 'iPhone');
    expect(cm.getConversation('c1').clientName).toBe('Juan');
    expect(mem.recall('c1', 'device')).toBe('iPhone');
  });

  it('searches across conversations with memory context', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c1.addMessage('client', 'Mi iPhone no funciona');
    mem.remember('c1', 'device', 'iPhone');
    const results = cs.searchConversations('iPhone');
    expect(results).toHaveLength(1);
  });

  it('tracks multiple conversations with memory', () => {
    cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    cm.createConversation({ conversationId: 'c2', clientName: 'Maria' });
    mem.remember('c1', 'status', 'pending');
    mem.remember('c2', 'status', 'completed');
    expect(mem.recall('c1', 'status')).toBe('pending');
    expect(mem.recall('c2', 'status')).toBe('completed');
  });

  it('listConversations by status with active memory', () => {
    cm.createConversation({ conversationId: 'c1', status: 'active' });
    cm.createConversation({ conversationId: 'c2', status: 'resolved' });
    expect(cm.listConversations({ status: 'active' })).toHaveLength(1);
  });

  it('getUnreadConversations integration', () => {
    const c1 = cm.createConversation({ conversationId: 'c1' });
    c1.addMessage('client', 'test');
    cm.createConversation({ conversationId: 'c2' });
    expect(cm.getUnreadConversations()).toHaveLength(1);
  });

  it('message search with session data', () => {
    const c = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c.addMessage('client', 'consulta');
    const results = cs.searchRecentMessages('consulta');
    expect(results).toHaveLength(1);
    expect(results[0].clientName).toBe('Juan');
  });

  it('pending replies with session status', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', status: 'active' });
    c1.addMessage('client', 'Hola');
    const c2 = cm.createConversation({ conversationId: 'c2', status: 'resolved' });
    c2.addMessage('client', 'Chau');
    expect(cm.getPendingReplies()).toHaveLength(1);
  });

  it('inactive clients with conversation data', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan', phone: '5492645555' });
    c1.lastInteraction = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
    const inactive = cs.listInactiveClients(30);
    expect(inactive[0].phone).toBe('5492645555');
  });

  it('memory summaries survive clear', () => {
    mem.setSummary('c1', 'test summary');
    mem.clearConversation('c1');
    expect(mem.getSummary('c1')).toBeNull();
  });

  it('conversation count after multiple operations', () => {
    cm.createConversation({ conversationId: 'c1' });
    cm.createConversation({ conversationId: 'c2' });
    cm.deleteConversation('c1');
    expect(cm.count()).toBe(1);
  });

  it('searchConversations with multiple filters', () => {
    cm.createConversation({ conversationId: 'c1', clientName: 'Juan Perez', status: 'active' });
    cm.createConversation({ conversationId: 'c2', clientName: 'Juan Lopez', status: 'resolved' });
    expect(cs.searchConversations('juan', { status: 'active' })).toHaveLength(1);
  });

  it('getConversationHistory returns conversation metadata', () => {
    const c = cm.createConversation({ conversationId: 'c1', clientName: 'Juan', phone: '5492645555', status: 'active' });
    c.addMessage('client', 'Hola');
    const hist = cs.getConversationHistory('c1');
    expect(hist).toHaveLength(1);
    expect(c.status).toBe('active');
  });

  it('allConversations returns all created', () => {
    cm.createConversation({ conversationId: 'c1' });
    cm.createConversation({ conversationId: 'c2' });
    cm.createConversation({ conversationId: 'c3' });
    expect(cm.allConversations).toHaveLength(3);
  });

  it('getConversationsByPhone returns all for phone', () => {
    cm.createConversation({ conversationId: 'c1', phone: '5492645555' });
    cm.createConversation({ conversationId: 'c2', phone: '5492645555' });
    expect(cm.getConversationsByPhone('5492645555')).toHaveLength(2);
  });

  it('session with tags and metadata', () => {
    const conv = cm.createConversation({ conversationId: 'c1', tags: ['urgent', 'vip'], metadata: { priority: 'high' } });
    expect(conv.tags).toContain('urgent');
    expect(conv.metadata.priority).toBe('high');
  });
});
