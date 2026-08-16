import { describe, it, expect, vi } from 'vitest';
import { AdminAssistant } from './admin-assistant.js';

describe('AdminAssistant Integration', () => {
  it('full flow: create conversation and get suggestions', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [],
      explanation: '{"suggestedReply": "Hola Juan, en que puedo ayudarte?", "suggestedAction": "Responder consulta", "suggestedTools": ["searchRepair"]}',
    }));
    const aa = new AdminAssistant({ chatFn });
    const conv = aa.conversationManager.createConversation({
      conversationId: 'int-c1',
      clientName: 'Juan',
      phone: '5492645555',
    });
    conv.addMessage('client', 'Hola, quiero saber el estado de mi reparacion');
    const suggestions = await aa.getSuggestions('int-c1');
    expect(suggestions.suggestedReply).toBeTruthy();
    expect(suggestions.suggestedAction).toBeTruthy();
    expect(conv.suggestedReply).toBeTruthy();
  });

  it('full flow: process admin message through engine', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [{ tool: 'searchConversation', params: { query: 'Juan' } }],
      explanation: 'Buscando conversaciones de Juan',
    }));
    const aa = new AdminAssistant({ chatFn });
    const result = await aa.process('Buscá conversaciones de Juan');
    expect(result).toBeDefined();
  });

  it('full flow: conversation with pendingTasks', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const conv = aa.conversationManager.createConversation({
      conversationId: 'int-c2',
      clientName: 'Maria',
    });
    conv.addPendingTask({ type: 'sendBudget', description: 'Enviar presupuesto a Maria' });
    expect(conv.pendingTasks).toHaveLength(1);
    expect(conv.pendingTasks[0].status).toBe('pending');
  });

  it('full flow: resolve pending task', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const conv = aa.conversationManager.createConversation({ conversationId: 'int-c3' });
    conv.addPendingTask({ type: 'test' });
    const taskId = conv.pendingTasks[0].id;
    conv.completeTask(taskId);
    expect(conv.pendingTasks[0].status).toBe('completed');
  });

  it('full flow: message history maintained across calls', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const conv = aa.conversationManager.createConversation({ conversationId: 'int-c4' });
    conv.addMessage('client', 'Mensaje 1');
    conv.addMessage('admin', 'Respuesta 1');
    conv.addMessage('client', 'Mensaje 2');
    expect(conv.history).toHaveLength(3);
    expect(conv.lastMessage).toBe('Mensaje 2');
  });

  it('full flow: multiple conversations in manager', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    aa.conversationManager.createConversation({ conversationId: 'c1', clientName: 'Juan', status: 'active' });
    aa.conversationManager.createConversation({ conversationId: 'c2', clientName: 'Maria', status: 'active' });
    aa.conversationManager.createConversation({ conversationId: 'c3', clientName: 'Pedro', status: 'resolved' });
    expect(aa.conversationManager.count({ status: 'active' })).toBe(2);
    expect(aa.conversationManager.count({ status: 'resolved' })).toBe(1);
  });

  it('full flow: search across conversations', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const c1 = aa.conversationManager.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    const c2 = aa.conversationManager.createConversation({ conversationId: 'c2', clientName: 'Maria' });
    c1.addMessage('client', 'problema con el telefono');
    c2.addMessage('client', 'consulta sobre presupuesto');
    const results = aa.conversationManager.searchMessages('telefono');
    expect(results).toHaveLength(1);
  });

  it('full flow: inactive clients detection', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const old = aa.conversationManager.createConversation({ conversationId: 'old', clientName: 'Viejo' });
    old.lastInteraction = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    aa.conversationManager.createConversation({ conversationId: 'new', clientName: 'Nuevo' });
    const inactive = aa.conversationManager.getInactiveClients(30);
    expect(inactive).toHaveLength(1);
    expect(inactive[0].clientName).toBe('Viejo');
  });

  it('full flow: conversation memory across sessions', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    aa.conversationMemory.remember('c1', 'device', 'iPhone');
    aa.conversationMemory.remember('c1', 'issue', 'no enciende');
    const memory = aa.conversationMemory.getConversationMemory('c1');
    expect(memory.device).toBe('iPhone');
    expect(memory.issue).toBe('no enciende');
  });

  it('full flow: tools integration with engine', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [
        { tool: 'listUnreadMessages', params: {} },
        { tool: 'searchPendingReplies', params: {} },
      ],
      explanation: 'Revisando mensajes',
    }));
    const aa = new AdminAssistant({ chatFn });
    const c1 = aa.conversationManager.createConversation({ conversationId: 'c1', clientName: 'Juan' });
    c1.addMessage('client', 'Hola');
    const result = await aa.process('Mostrame los mensajes sin leer');
    expect(result).toBeDefined();
  });

  it('full flow: admin suggestion with memory context', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [],
      explanation: '{"suggestedReply": "Si, claro", "suggestedAction": "Confirmar", "suggestedTools": ["markConversationResolved"]}',
    }));
    const aa = new AdminAssistant({ chatFn });
    const conv = aa.conversationManager.createConversation({ conversationId: 'c1', clientName: 'Pedro' });
    conv.addMessage('client', 'Gracias por la ayuda');
    aa.conversationMemory.remember('c1', 'resolved', true);
    const suggestions = await aa.getSuggestions('c1');
    expect(suggestions.suggestedTools).toContain('markConversationResolved');
  });

  it('full flow: human-in-the-loop confirmation chain', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const conv = aa.conversationManager.createConversation({ conversationId: 'c1', phone: '5492645555', clientName: 'Juan' });
    const attempt1 = await aa.sendMessage('c1', 'Hola Juan', 'admin-1', false);
    expect(attempt1.requiresConfirmation).toBe(true);
    const attempt2 = await aa.sendMessage('c1', 'Hola Juan', 'admin-1', true);
    expect(attempt2.success).toBe(true);
    expect(conv.history[0].role).toBe('admin');
  });
});
