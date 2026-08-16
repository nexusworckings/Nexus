import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager } from './conversation-manager.js';
import { ConversationMemory } from './conversation-memory.js';
import { ConversationSearch } from './conversation-search.js';

describe('ConversationSearch', () => {
  let cm, mem, cs;

  beforeEach(() => {
    cm = new ConversationManager();
    mem = new ConversationMemory();
    cs = new ConversationSearch(cm, mem);
  });

  it('searchConversations finds by name', () => {
    cm.createConversation({ conversationId: 'c1', clientName: 'Juan Perez' });
    cm.createConversation({ conversationId: 'c2', clientName: 'Maria Lopez' });
    expect(cs.searchConversations('juan')).toHaveLength(1);
  });

  it('searchConversations finds by phone', () => {
    cm.createConversation({ conversationId: 'c1', phone: '5492645555' });
    expect(cs.searchConversations('2645555')).toHaveLength(1);
  });

  it('searchConversations finds by lastMessage', () => {
    const c = cm.createConversation({ conversationId: 'c1' });
    c.addMessage('client', 'Hola, quiero un presupuesto');
    expect(cs.searchConversations('presupuesto')).toHaveLength(1);
  });

  it('searchConversations finds by conversationId', () => {
    cm.createConversation({ conversationId: 'conv-123' });
    expect(cs.searchConversations('conv-123')).toHaveLength(1);
  });

  it('searchConversations with status filter', () => {
    cm.createConversation({ conversationId: 'c1', clientName: 'Juan', status: 'active' });
    cm.createConversation({ conversationId: 'c2', clientName: 'Juan', status: 'resolved' });
    expect(cs.searchConversations('juan', { status: 'active' })).toHaveLength(1);
  });

  it('getConversationHistory returns messages', () => {
    const c = cm.createConversation({ conversationId: 'c1' });
    c.addMessage('client', 'Hola');
    c.addMessage('admin', 'Hola que tal');
    const hist = cs.getConversationHistory('c1');
    expect(hist).toHaveLength(2);
    expect(hist[0].content).toBe('Hola');
  });

  it('getConversationHistory returns empty for unknown conv', () => {
    expect(cs.getConversationHistory('none')).toEqual([]);
  });

  it('getConversationHistory respects limit', () => {
    const c = cm.createConversation({ conversationId: 'c1' });
    for (let i = 0; i < 10; i++) c.addMessage('client', `msg${i}`);
    expect(cs.getConversationHistory('c1', 3)).toHaveLength(3);
  });

  it('listUnreadMessages returns unread conversations', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c1.addMessage('client', 'Hola');
    cm.createConversation({ conversationId: 'c2', clientName: 'Maria' });
    const unread = cs.listUnreadMessages();
    expect(unread).toHaveLength(1);
    expect(unread[0].clientName).toBe('Juan');
  });

  it('listUnreadMessages includes expected fields', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan', phone: '5492645555' });
    c1.addMessage('client', 'Hola');
    const unread = cs.listUnreadMessages();
    expect(unread[0]).toHaveProperty('conversationId');
    expect(unread[0]).toHaveProperty('clientName');
    expect(unread[0]).toHaveProperty('phone');
    expect(unread[0]).toHaveProperty('unreadCount');
    expect(unread[0]).toHaveProperty('lastInteraction');
  });

  it('listInactiveClients returns inactive', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c1.lastInteraction = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    cm.createConversation({ conversationId: 'c2' });
    const inactive = cs.listInactiveClients(30);
    expect(inactive).toHaveLength(1);
    expect(inactive[0].daysInactive).toBeGreaterThanOrEqual(40);
  });

  it('listInactiveClients includes daysInactive', () => {
    const c1 = cm.createConversation({ conversationId: 'c1' });
    c1.lastInteraction = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const inactive = cs.listInactiveClients(25);
    expect(inactive[0].daysInactive).toBeGreaterThanOrEqual(30);
  });

  it('searchRecentMessages finds messages', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c1.addMessage('client', 'Mi telefono se rompio');
    const results = cs.searchRecentMessages('telefono');
    expect(results).toHaveLength(1);
    expect(results[0].message.content).toBe('Mi telefono se rompio');
  });

  it('searchRecentMessages respects limit', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    for (let i = 0; i < 5; i++) c1.addMessage('client', `test ${i}`);
    const results = cs.searchRecentMessages('test', 2);
    expect(results).toHaveLength(2);
  });

  it('searchPendingReplies returns conversations awaiting reply', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c1.addMessage('client', 'Hola');
    cm.createConversation({ conversationId: 'c2' });
    const pending = cs.searchPendingReplies();
    expect(pending).toHaveLength(1);
    expect(pending[0].clientName).toBe('Juan');
  });

  it('searchPendingReplies includes expected fields', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan', phone: '5492645555' });
    c1.addMessage('client', 'Consulta');
    const pending = cs.searchPendingReplies();
    expect(pending[0]).toHaveProperty('conversationId');
    expect(pending[0]).toHaveProperty('clientName');
    expect(pending[0]).toHaveProperty('lastMessage');
  });

  it('getMemorySummary returns memory and summary', () => {
    mem.remember('c1', 'device', 'iPhone');
    mem.setSummary('c1', 'Cliente con iPhone roto');
    const result = cs.getMemorySummary('c1');
    expect(result.memory.device).toBe('iPhone');
    expect(result.summary).toBe('Cliente con iPhone roto');
  });

  it('getMemorySummary returns empty for unknown', () => {
    const result = cs.getMemorySummary('none');
    expect(result.memory).toEqual({});
    expect(result.summary).toBeNull();
  });
});
