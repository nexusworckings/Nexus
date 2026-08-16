import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../tool-registry.js';
import { ConversationManager } from '../conversation-manager.js';
import { ConversationMemory } from '../conversation-memory.js';
import { ConversationSearch } from '../conversation-search.js';
import { MessageBuilder } from '../message-builder.js';
import { registerConversationTools } from './conversation-tools.js';

describe('Conversation Tools', () => {
  let registry, cm, mem, cs, mb;

  beforeEach(() => {
    registry = new ToolRegistry();
    cm = new ConversationManager();
    mem = new ConversationMemory();
    cs = new ConversationSearch(cm, mem);
    mb = new MessageBuilder();
    registerConversationTools(registry, { conversationManager: cm, conversationMemory: mem, conversationSearch: cs, messageBuilder: mb });
  });

  describe('searchConversation', () => {
    it('searches by client name', async () => {
      cm.createConversation({ conversationId: 'c1', clientName: 'Juan Perez' });
      cm.createConversation({ conversationId: 'c2', clientName: 'Maria Lopez' });
      const tool = registry.get('searchConversation');
      const result = await tool.execute({ query: 'juan' });
      expect(result).toHaveLength(1);
    });

    it('searches by phone', async () => {
      cm.createConversation({ conversationId: 'c1', phone: '5492645555' });
      const tool = registry.get('searchConversation');
      const result = await tool.execute({ query: '2645555' });
      expect(result).toHaveLength(1);
    });

    it('searches by lastMessage', async () => {
      const c = cm.createConversation({ conversationId: 'c1' });
      c.addMessage('client', 'consulta sobre presupuesto');
      const tool = registry.get('searchConversation');
      const result = await tool.execute({ query: 'presupuesto' });
      expect(result).toHaveLength(1);
    });

    it('filters by status', async () => {
      cm.createConversation({ conversationId: 'c1', clientName: 'Juan', status: 'active' });
      cm.createConversation({ conversationId: 'c2', clientName: 'Juan', status: 'resolved' });
      const tool = registry.get('searchConversation');
      const result = await tool.execute({ query: 'Juan', status: 'resolved' });
      expect(result).toHaveLength(1);
    });
  });

  describe('getConversationHistory', () => {
    it('returns history for existing conversation', async () => {
      const c = cm.createConversation({ conversationId: 'c1' });
      c.addMessage('client', 'Hola');
      c.addMessage('admin', 'Hola que tal');
      const tool = registry.get('getConversationHistory');
      const result = await tool.execute({ conversationId: 'c1' });
      expect(result.history).toHaveLength(2);
      expect(result.clientName).toBeDefined();
    });

    it('returns error for missing conversation', async () => {
      const tool = registry.get('getConversationHistory');
      const result = await tool.execute({ conversationId: 'none' });
      expect(result.error).toBe('Conversation not found');
    });

    it('respects limit', async () => {
      const c = cm.createConversation({ conversationId: 'c1' });
      for (let i = 0; i < 10; i++) c.addMessage('client', `msg${i}`);
      const tool = registry.get('getConversationHistory');
      const result = await tool.execute({ conversationId: 'c1', limit: 3 });
      expect(result.history).toHaveLength(3);
    });
  });

  describe('listUnreadMessages', () => {
    it('returns unread conversations', async () => {
      const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
      c1.addMessage('client', 'Hola');
      cm.createConversation({ conversationId: 'c2' });
      const tool = registry.get('listUnreadMessages');
      const result = await tool.execute({});
      expect(result).toHaveLength(1);
    });

    it('includes expected fields', async () => {
      const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan', phone: '5492645555' });
      c1.addMessage('client', 'test');
      const tool = registry.get('listUnreadMessages');
      const result = await tool.execute({});
      expect(result[0]).toHaveProperty('unreadCount');
      expect(result[0]).toHaveProperty('lastInteraction');
    });
  });

  describe('listInactiveClients', () => {
    it('returns inactive clients', async () => {
      const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
      c1.lastInteraction = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      const tool = registry.get('listInactiveClients');
      const result = await tool.execute({ days: 30 });
      expect(result).toHaveLength(1);
      expect(result[0].daysInactive).toBeGreaterThanOrEqual(40);
    });

    it('defaults to 30 days', async () => {
      const c1 = cm.createConversation({ conversationId: 'c1' });
      c1.lastInteraction = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const tool = registry.get('listInactiveClients');
      const result = await tool.execute({});
      expect(result).toHaveLength(0);
    });
  });

  describe('buildWhatsAppMessage', () => {
    it('builds repairReady template', async () => {
      const tool = registry.get('buildWhatsAppMessage');
      const result = await tool.execute({ template: 'repairReady', data: { clientName: 'Juan', device: 'notebook' } });
      expect(result.message).toContain('Hola Juan');
      expect(result.template).toBe('repairReady');
    });

    it('builds all supported templates', async () => {
      const tool = registry.get('buildWhatsAppMessage');
      const templates = ['repairReady', 'repairInProgress', 'budgetReady', 'budgetApproved', 'printOrderReady', 'appointmentReminder', 'paymentReminder', 'generalNotification', 'replyToClient', 'bulkNotification', 'customMessage'];
      for (const t of templates) {
        const result = await tool.execute({ template: t, data: { clientName: 'Test', message: 'test', reply: 'test', body: 'test', device: 'test' } });
        expect(result.message).toBeTruthy();
        expect(result.template).toBe(t);
      }
    });

    it('returns error for unknown template', async () => {
      const tool = registry.get('buildWhatsAppMessage');
      const result = await tool.execute({ template: 'nonexistent', data: {} });
      expect(result.error).toContain('Unknown template');
    });
  });

  describe('sendBulkWhatsApp', () => {
    it('requires confirmation for bulk send', async () => {
      const tool = registry.get('sendBulkWhatsApp');
      const result = await tool.execute({ phones: ['5492645555'], message: 'Hola' });
      expect(result.requiresConfirmation).toBe(true);
    });

    it('requires WhatsApp channel when confirmed', async () => {
      const tool = registry.get('sendBulkWhatsApp');
      const result = await tool.execute({ phones: ['5492645555'], message: 'Hola', confirmed: true });
      expect(result.error).toBe('WhatsApp channel not available');
    });

    it('reports results for multiple phones when confirmed', async () => {
      const mockWc = { send: vi.fn().mockResolvedValue({ id: 'msg-1' }) };
      const reg = new ToolRegistry();
      registerConversationTools(reg, { whatsappChannel: mockWc });
      const tool = reg.get('sendBulkWhatsApp');
      const result = await tool.execute({ phones: ['5492645555', '5492646666'], message: 'Hola', confirmed: true });
      expect(result.total).toBe(2);
      expect(result.sent).toBe(2);
    });
  });

  describe('sendWhatsApp', () => {
    it('requires confirmation', async () => {
      const tool = registry.get('sendWhatsApp');
      const result = await tool.execute({ phone: '5492645555', message: 'Hola' });
      expect(result.requiresConfirmation).toBe(true);
    });

    it('sends when confirmed (simulated without channel)', async () => {
      const tool = registry.get('sendWhatsApp');
      const result = await tool.execute({ phone: '5492645555', message: 'Hola', confirmed: true });
      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
    });

    it('sends via WhatsApp channel when confirmed and channel available', async () => {
      const mockWc = { send: vi.fn().mockResolvedValue({ id: 'wa-1' }) };
      const reg = new ToolRegistry();
      registerConversationTools(reg, { whatsappChannel: mockWc });
      const tool = reg.get('sendWhatsApp');
      const result = await tool.execute({ phone: '5492645555', message: 'Hola', confirmed: true });
      expect(result.success).toBe(true);
      expect(mockWc.send).toHaveBeenCalledWith('5492645555', 'Hola');
    });

    it('sendWhatsApp handles channel error', async () => {
      const mockWc = { send: vi.fn().mockRejectedValue(new Error('Network error')) };
      const reg = new ToolRegistry();
      registerConversationTools(reg, { whatsappChannel: mockWc });
      const tool = reg.get('sendWhatsApp');
      const result = await tool.execute({ phone: '5492645555', message: 'Hola', confirmed: true });
      expect(result.success).toBe(false);
    });
  });

  describe('markConversationResolved', () => {
    it('marks conversation as resolved', async () => {
      cm.createConversation({ conversationId: 'c1' });
      const tool = registry.get('markConversationResolved');
      const result = await tool.execute({ conversationId: 'c1' });
      expect(result.success).toBe(true);
      expect(result.status).toBe('resolved');
    });

    it('returns error for missing conversation', async () => {
      const tool = registry.get('markConversationResolved');
      const result = await tool.execute({ conversationId: 'none' });
      expect(result.error).toBe('Conversation not found');
    });
  });

  describe('assignConversation', () => {
    it('assigns admin to conversation', async () => {
      cm.createConversation({ conversationId: 'c1' });
      const tool = registry.get('assignConversation');
      const result = await tool.execute({ conversationId: 'c1', adminId: 'admin-1' });
      expect(result.success).toBe(true);
      expect(result.assignedAdmin).toBe('admin-1');
    });

    it('returns error for missing conversation', async () => {
      const tool = registry.get('assignConversation');
      const result = await tool.execute({ conversationId: 'none', adminId: 'admin-1' });
      expect(result.error).toBe('Conversation not found');
    });
  });

  describe('searchRecentMessages', () => {
    it('searches messages by content', async () => {
      const c = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
      c.addMessage('client', 'mi telefono no funciona');
      const tool = registry.get('searchRecentMessages');
      const result = await tool.execute({ query: 'telefono' });
      expect(result).toHaveLength(1);
    });

    it('respects limit', async () => {
      const c = cm.createConversation({ conversationId: 'c1' });
      for (let i = 0; i < 5; i++) c.addMessage('client', `test ${i}`);
      const tool = registry.get('searchRecentMessages');
      const result = await tool.execute({ query: 'test', limit: 2 });
      expect(result).toHaveLength(2);
    });
  });

  describe('searchPendingReplies', () => {
    it('returns conversations awaiting reply', async () => {
      const c1 = cm.createConversation({ conversationId: 'c1', clientName: 'Juan' });
      c1.addMessage('client', 'Hola');
      cm.createConversation({ conversationId: 'c2' });
      const tool = registry.get('searchPendingReplies');
      const result = await tool.execute({});
      expect(result).toHaveLength(1);
      expect(result[0].clientName).toBe('Juan');
    });

    it('does not return conversations last replied by admin', async () => {
      const c1 = cm.createConversation({ conversationId: 'c1' });
      c1.addMessage('admin', 'Hola');
      const tool = registry.get('searchPendingReplies');
      const result = await tool.execute({});
      expect(result).toHaveLength(0);
    });
  });

  describe('without ConversationManager', () => {
    it('searchConversation returns error', async () => {
      const reg = new ToolRegistry();
      registerConversationTools(reg, {});
      const tool = reg.get('searchConversation');
      const result = await tool.execute({ query: 'test' });
      expect(result.error).toBe('ConversationManager not available');
    });
  });
});
