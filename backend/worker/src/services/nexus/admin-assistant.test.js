import { describe, it, expect, vi } from 'vitest';
import { AdminAssistant } from './admin-assistant.js';

describe('AdminAssistant', () => {
  it('throws without chatFn', () => {
    expect(() => new AdminAssistant()).toThrow('chatFn is required');
  });

  it('creates with chatFn', () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    expect(aa.engine).toBeDefined();
    expect(aa.toolRegistry).toBeDefined();
    expect(aa.conversationManager).toBeDefined();
    expect(aa.conversationMemory).toBeDefined();
    expect(aa.conversationSearch).toBeDefined();
    expect(aa.messageBuilder).toBeDefined();
  });

  it('process delegates to engine with admin profile', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'ok' }));
    const aa = new AdminAssistant({ chatFn });
    const result = await aa.process('test');
    expect(result).toBeDefined();
  });

  it('conversation tools are registered', () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    expect(aa.toolRegistry.exists('searchConversation')).toBe(true);
    expect(aa.toolRegistry.exists('getConversationHistory')).toBe(true);
    expect(aa.toolRegistry.exists('listUnreadMessages')).toBe(true);
    expect(aa.toolRegistry.exists('listInactiveClients')).toBe(true);
    expect(aa.toolRegistry.exists('buildWhatsAppMessage')).toBe(true);
    expect(aa.toolRegistry.exists('sendBulkWhatsApp')).toBe(true);
    expect(aa.toolRegistry.exists('markConversationResolved')).toBe(true);
    expect(aa.toolRegistry.exists('assignConversation')).toBe(true);
    expect(aa.toolRegistry.exists('searchRecentMessages')).toBe(true);
    expect(aa.toolRegistry.exists('searchPendingReplies')).toBe(true);
  });

  it('sendMessage without confirmation returns requiresConfirmation', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const conv = aa.conversationManager.createConversation({ conversationId: 'c1', phone: '5492645555' });
    const result = await aa.sendMessage('c1', 'Hola', 'admin-1', false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.success).toBe(false);
  });

  it('sendMessage with confirmation sends message', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    aa.conversationManager.createConversation({ conversationId: 'c1', phone: '5492645555' });
    const result = await aa.sendMessage('c1', 'Hola', 'admin-1', true);
    expect(result.success).toBe(true);
    expect(result.sent).toBe(true);
  });

  it('sendMessage for nonexistent conversation', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const result = await aa.sendMessage('nonexistent', 'Hola', 'admin-1', true);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Conversación no encontrada');
  });

  it('sendMessage without phone saves locally', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    aa.conversationManager.createConversation({ conversationId: 'c1' });
    const result = await aa.sendMessage('c1', 'Hola', 'admin-1', true);
    expect(result.success).toBe(true);
    expect(result.sent).toBe(false);
  });

  it('getSuggestions returns null for unknown conversation', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const result = await aa.getSuggestions('nonexistent');
    expect(result).toBeNull();
  });

  it('getSuggestions returns suggestions for existing conversation', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [],
      explanation: '{"suggestedReply": "Hola Juan", "suggestedAction": "Enviar mensaje", "suggestedTools": ["sendWhatsApp"]}',
    }));
    const aa = new AdminAssistant({ chatFn });
    const conv = aa.conversationManager.createConversation({ conversationId: 'c1' });
    conv.addMessage('client', 'Hola, quiero reparar mi celular');
    const result = await aa.getSuggestions('c1');
    expect(result.suggestedReply).toBe('Hola Juan');
    expect(result.suggestedAction).toBe('Enviar mensaje');
    expect(result.suggestedTools).toContain('sendWhatsApp');
  });

  it('getSuggestions handles engine failure', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    aa.conversationManager.createConversation({ conversationId: 'c1' });
    vi.spyOn(aa.engine, 'process').mockRejectedValue(new Error('fail'));
    const result = await aa.getSuggestions('c1');
    expect(result).toBeDefined();
    expect(result.suggestedAction).toContain('manual');
  });

  it('process passes admin profile to engine', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({ plan: [], explanation: 'ok' }));
    const aa = new AdminAssistant({ chatFn });
    const spy = vi.spyOn(aa.engine, 'process');
    await aa.process('test', { sessionId: 's1' });
    expect(spy).toHaveBeenCalledWith('test', expect.objectContaining({ profile: 'admin', sessionId: 's1' }));
  });

  it('exposes all getters', () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    expect(aa.metrics).toBeDefined();
    expect(aa.contextManager).toBeDefined();
  });

  it('conversation tools work with ConversationManager', async () => {
    const aa = new AdminAssistant({ chatFn: async () => '{}' });
    const c1 = aa.conversationManager.createConversation({ conversationId: 'c1', clientName: 'Test' });
    c1.addMessage('client', 'Hola');
    const tool = aa.toolRegistry.get('searchConversation');
    const result = await tool.execute({ query: 'Test' });
    expect(result).toHaveLength(1);
  });

  it('getSuggestions stores suggestions on conversation', async () => {
    const chatFn = vi.fn().mockResolvedValue(JSON.stringify({
      plan: [],
      explanation: '{"suggestedReply": "Gracias", "suggestedAction": "Cerrar", "suggestedTools": ["markConversationResolved"]}',
    }));
    const aa = new AdminAssistant({ chatFn });
    const conv = aa.conversationManager.createConversation({ conversationId: 'c1' });
    conv.addMessage('client', 'Gracias');
    await aa.getSuggestions('c1');
    expect(conv.suggestedReply).toBe('Gracias');
    expect(conv.suggestedTools).toContain('markConversationResolved');
  });
});
