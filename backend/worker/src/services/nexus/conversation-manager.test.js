import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager } from './conversation-manager.js';

describe('ConversationManager', () => {
  let cm;

  beforeEach(() => {
    cm = new ConversationManager();
  });

  it('starts empty', () => {
    expect(cm.listConversations()).toEqual([]);
    expect(cm.count()).toBe(0);
  });

  it('creates and retrieves a conversation', () => {
    const conv = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    expect(conv.conversationId).toBe('c1');
    expect(cm.getConversation('c1').clientName).toBe('Juan');
  });

  it('hasConversation returns correct boolean', () => {
    cm.createConversation({ conversationId: 'c1' });
    expect(cm.hasConversation('c1')).toBe(true);
    expect(cm.hasConversation('nonexistent')).toBe(false);
  });

  it('deleteConversation removes conversation', () => {
    cm.createConversation({ conversationId: 'c1' });
    cm.deleteConversation('c1');
    expect(cm.hasConversation('c1')).toBe(false);
  });

  it('listConversations by status', () => {
    cm.createConversation({ conversationId: 'c1', status: 'active' });
    cm.createConversation({ conversationId: 'c2', status: 'resolved' });
    cm.createConversation({ conversationId: 'c3', status: 'active' });
    expect(cm.listConversations({ status: 'active' })).toHaveLength(2);
    expect(cm.listConversations({ status: 'resolved' })).toHaveLength(1);
  });

  it('listConversations by assignedAdmin', () => {
    cm.createConversation({ conversationId: 'c1', assignedAdmin: 'admin-1' });
    cm.createConversation({ conversationId: 'c2', assignedAdmin: 'admin-2' });
    expect(cm.listConversations({ assignedAdmin: 'admin-1' })).toHaveLength(1);
  });

  it('listConversations by channel', () => {
    cm.createConversation({ conversationId: 'c1', channel: 'whatsapp' });
    cm.createConversation({ conversationId: 'c2', channel: 'messenger' });
    expect(cm.listConversations({ channel: 'whatsapp' })).toHaveLength(1);
  });

  it('listConversations by clientId', () => {
    cm.createConversation({ conversationId: 'c1', clientId: 'cli-1' });
    cm.createConversation({ conversationId: 'c2', clientId: 'cli-2' });
    expect(cm.listConversations({ clientId: 'cli-1' })).toHaveLength(1);
  });

  it('listConversations search by name', () => {
    cm.createConversation({ conversationId: 'c1', clientName: 'Juan Perez' });
    cm.createConversation({ conversationId: 'c2', clientName: 'Maria Lopez' });
    expect(cm.listConversations({ search: 'juan' })).toHaveLength(1);
  });

  it('listConversations search by phone', () => {
    cm.createConversation({ conversationId: 'c1', phone: '5492645555' });
    expect(cm.listConversations({ search: '2645555' })).toHaveLength(1);
  });

  it('listConversations search by last message', () => {
    const conv = cm.createConversation({ conversationId: 'c1' });
    conv.addMessage('client', 'Hola, quiero reparar mi celular');
    expect(cm.listConversations({ search: 'reparar' })).toHaveLength(1);
  });

  it('listConversations unread filter', () => {
    const c1 = cm.createConversation({ conversationId: 'c1' });
    c1.addMessage('client', 'test');
    cm.createConversation({ conversationId: 'c2' });
    expect(cm.listConversations({ unread: true })).toHaveLength(1);
  });

  it('listConversations sorts by lastInteraction descending', async () => {
    const c1 = cm.createConversation({ conversationId: 'c1' });
    await new Promise(r => setTimeout(r, 5));
    const c2 = cm.createConversation({ conversationId: 'c2' });
    c2.addMessage('client', 'recent');
    const list = cm.listConversations();
    expect(list[0].conversationId).toBe('c2');
  });

  it('count returns correct number', () => {
    cm.createConversation({ conversationId: 'c1' });
    cm.createConversation({ conversationId: 'c2' });
    expect(cm.count()).toBe(2);
  });

  it('count with filters', () => {
    cm.createConversation({ conversationId: 'c1', status: 'active' });
    cm.createConversation({ conversationId: 'c2', status: 'resolved' });
    expect(cm.count({ status: 'active' })).toBe(1);
  });

  it('getInactiveClients returns overdue conversations', () => {
    const old = cm.createConversation({ conversationId: 'c1' });
    old.lastInteraction = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    cm.createConversation({ conversationId: 'c2' });
    const inactive = cm.getInactiveClients(30);
    expect(inactive).toHaveLength(1);
    expect(inactive[0].conversationId).toBe('c1');
  });

  it('getConversationsByPhone returns matches', () => {
    cm.createConversation({ conversationId: 'c1', phone: '5492645555' });
    cm.createConversation({ conversationId: 'c2', phone: '5492645555' });
    cm.createConversation({ conversationId: 'c3', phone: '5492646666' });
    expect(cm.getConversationsByPhone('5492645555')).toHaveLength(2);
  });

  it('getUnreadConversations returns only unread', () => {
    const c1 = cm.createConversation({ conversationId: 'c1' });
    c1.addMessage('client', 'test');
    cm.createConversation({ conversationId: 'c2' });
    expect(cm.getUnreadConversations()).toHaveLength(1);
  });

  it('searchMessages finds messages by content', () => {
    const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c1.addMessage('client', 'Mi telefono no funciona');
    const results = cm.searchMessages('telefono');
    expect(results).toHaveLength(1);
    expect(results[0].message.content).toBe('Mi telefono no funciona');
  });

  it('searchMessages returns empty for no matches', () => {
    const c1 = cm.createConversation({ conversationId: 'c1' });
    c1.addMessage('client', 'Hola');
    expect(cm.searchMessages('xyz')).toEqual([]);
  });

  it('getPendingReplies returns conversations awaiting admin reply', () => {
    const c1 = cm.createConversation({ conversationId: 'c1' });
    c1.addMessage('client', 'Hola');
    const c2 = cm.createConversation({ conversationId: 'c2' });
    c2.addMessage('admin', 'Hola');
    const pending = cm.getPendingReplies();
    expect(pending).toHaveLength(1);
    expect(pending[0].conversationId).toBe('c1');
  });

  it('clear removes all conversations', () => {
    cm.createConversation({ conversationId: 'c1' });
    cm.createConversation({ conversationId: 'c2' });
    cm.clear();
    expect(cm.count()).toBe(0);
  });

  it('allConversations returns all', () => {
    cm.createConversation({ conversationId: 'c1' });
    cm.createConversation({ conversationId: 'c2' });
    expect(cm.allConversations).toHaveLength(2);
  });

  it('getConversation returns null for missing', () => {
    expect(cm.getConversation('nonexistent')).toBeNull();
  });

  it('handles many conversations', () => {
    for (let i = 0; i < 100; i++) {
      cm.createConversation({ conversationId: `c${i}` });
    }
    expect(cm.count()).toBe(100);
  });
});
