import { describe, it, expect } from 'vitest';
import { ConversationSession } from './conversation-session.js';

describe('ConversationSession', () => {
  it('creates session with defaults', () => {
    const s = new ConversationSession();
    expect(s.conversationId).toBeTruthy();
    expect(s.status).toBe('active');
    expect(s.channel).toBe('whatsapp');
    expect(s.history).toEqual([]);
    expect(s.pendingTasks).toEqual([]);
    expect(s.unreadCount).toBe(0);
  });

  it('creates session with data', () => {
    const s = new ConversationSession({ conversationId: 'c1', clientId: 'cli-1', clientName: 'Juan', phone: '5492645555' });
    expect(s.conversationId).toBe('c1');
    expect(s.clientId).toBe('cli-1');
    expect(s.clientName).toBe('Juan');
    expect(s.phone).toBe('5492645555');
  });

  it('addMessage appends to history and updates metadata', () => {
    const s = new ConversationSession({ conversationId: 'c2' });
    s.addMessage('client', 'Hola');
    expect(s.history).toHaveLength(1);
    expect(s.history[0].role).toBe('client');
    expect(s.history[0].content).toBe('Hola');
    expect(s.lastMessage).toBe('Hola');
    expect(s.unreadCount).toBe(1);
  });

  it('addMessage with admin role does not increment unread', () => {
    const s = new ConversationSession({ conversationId: 'c3' });
    s.addMessage('admin', 'Hola');
    expect(s.unreadCount).toBe(0);
  });

  it('addMessage stores metadata', () => {
    const s = new ConversationSession({ conversationId: 'c4' });
    s.addMessage('client', 'Test', { adminId: 'a1' });
    expect(s.history[0].adminId).toBe('a1');
  });

  it('assignAdmin sets admin', () => {
    const s = new ConversationSession({ conversationId: 'c5' });
    s.assignAdmin('admin-1');
    expect(s.assignedAdmin).toBe('admin-1');
  });

  it('resolve sets status to resolved', () => {
    const s = new ConversationSession({ conversationId: 'c6' });
    s.resolve();
    expect(s.status).toBe('resolved');
  });

  it('reopen sets status to active', () => {
    const s = new ConversationSession({ conversationId: 'c7' });
    s.resolve();
    s.reopen();
    expect(s.status).toBe('active');
  });

  it('markRead resets unread count', () => {
    const s = new ConversationSession({ conversationId: 'c8' });
    s.addMessage('client', 'test');
    s.markRead();
    expect(s.unreadCount).toBe(0);
  });

  it('addPendingTask adds task with defaults', () => {
    const s = new ConversationSession({ conversationId: 'c9' });
    s.addPendingTask({ type: 'sendMessage', description: 'Enviar presupuesto' });
    expect(s.pendingTasks).toHaveLength(1);
    expect(s.pendingTasks[0].type).toBe('sendMessage');
    expect(s.pendingTasks[0].status).toBe('pending');
    expect(s.pendingTasks[0].id).toBeTruthy();
  });

  it('completeTask marks task as completed', () => {
    const s = new ConversationSession({ conversationId: 'c10' });
    s.addPendingTask({ type: 'test' });
    const taskId = s.pendingTasks[0].id;
    s.completeTask(taskId);
    expect(s.pendingTasks[0].status).toBe('completed');
    expect(s.pendingTasks[0].completedAt).toBeTruthy();
  });

  it('completeTask does nothing for nonexistent task', () => {
    const s = new ConversationSession({ conversationId: 'c11' });
    s.completeTask('nonexistent');
    expect(s.pendingTasks).toHaveLength(0);
  });

  it('setSuggestion stores suggestion data', () => {
    const s = new ConversationSession({ conversationId: 'c12' });
    s.setSuggestion('Reply', 'Action', ['tool1']);
    expect(s.suggestedReply).toBe('Reply');
    expect(s.suggestedAction).toBe('Action');
    expect(s.suggestedTools).toEqual(['tool1']);
  });

  it('toJSON returns plain object', () => {
    const s = new ConversationSession({ conversationId: 'c13', clientName: 'Ana' });
    const json = s.toJSON();
    expect(json.conversationId).toBe('c13');
    expect(json.clientName).toBe('Ana');
    expect(json.status).toBe('active');
    expect(Array.isArray(json.history)).toBe(true);
  });

  it('toJSON includes all fields', () => {
    const s = new ConversationSession({ conversationId: 'c14', tags: ['urgent'] });
    const json = s.toJSON();
    expect(json.tags).toEqual(['urgent']);
    expect(json.metadata).toBeDefined();
    expect(json.createdAt).toBeTruthy();
    expect(json.updatedAt).toBeTruthy();
  });

  it('generates unique conversationId when not provided', () => {
    const s1 = new ConversationSession();
    const s2 = new ConversationSession();
    expect(s1.conversationId).not.toBe(s2.conversationId);
  });

  it('updates updatedAt on interactions', async () => {
    const s = new ConversationSession({ conversationId: 'c15' });
    const before = s.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    s.addMessage('client', 'test');
    expect(s.updatedAt).not.toBe(before);
  });

  it('handles multiple messages in order', () => {
    const s = new ConversationSession({ conversationId: 'c16' });
    s.addMessage('client', 'Mensaje 1');
    s.addMessage('admin', 'Respuesta 1');
    s.addMessage('client', 'Mensaje 2');
    expect(s.history).toHaveLength(3);
    expect(s.history[0].content).toBe('Mensaje 1');
    expect(s.history[1].content).toBe('Respuesta 1');
    expect(s.history[2].content).toBe('Mensaje 2');
    expect(s.lastMessage).toBe('Mensaje 2');
  });

  it('stores metadata on session creation', () => {
    const s = new ConversationSession({ conversationId: 'c17', metadata: { source: 'web' } });
    expect(s.metadata.source).toBe('web');
  });
});
