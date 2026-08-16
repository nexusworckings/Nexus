import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../nexus/tool-registry.js';
import { registerWhatsAppRealTools } from './whatsapp-real-tools.js';
import { ConversationManager } from '../nexus/conversation-manager.js';

describe('WhatsApp Real Tools', () => {
  let registry, cm, ws;

  beforeEach(() => {
    registry = new ToolRegistry();
    cm = new ConversationManager();
    ws = {
      sendMessage: vi.fn(),
      markAsRead: vi.fn(),
      sendTypingIndicator: vi.fn(),
      getMediaUrl: vi.fn(),
      webhookHandler: { handlePost: vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ status: 'processed' }] }), { status: 200 })) },
    };
    registerWhatsAppRealTools(registry, { whatsappService: ws, conversationManager: cm });
  });

  it('receiveWhatsApp processes payload', async () => {
    const tool = registry.get('receiveWhatsApp');
    const result = await tool.execute({ payload: { entry: [] } });
    expect(result).toBeDefined();
  });

  it('receiveWhatsApp returns error without service', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('receiveWhatsApp');
    const result = await tool.execute({ payload: {} });
    expect(result.error).toBe('WhatsAppService not available');
  });

  it('sendWhatsAppReal requires confirmation', async () => {
    const tool = registry.get('sendWhatsAppReal');
    const result = await tool.execute({ phone: '5492645555', message: 'Hola' });
    expect(result.requiresConfirmation).toBe(true);
  });

  it('sendWhatsAppReal sends when confirmed', async () => {
    ws.sendMessage.mockResolvedValue({ success: true, id: 'wa-1' });
    const tool = registry.get('sendWhatsAppReal');
    const result = await tool.execute({ phone: '5492645555', message: 'Hola', confirmed: true });
    expect(result.success).toBe(true);
  });

  it('sendWhatsAppReal without service', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('sendWhatsAppReal');
    const result = await tool.execute({ phone: '5492645555', message: 'Hola', confirmed: true });
    expect(result.error).toBe('WhatsAppService not available');
  });

  it('downloadMedia returns media info', async () => {
    ws.getMediaUrl.mockResolvedValue({ mediaId: 'm1', url: 'https://cdn.com/img', mimeType: 'image/jpeg', fileSize: 1000, fileName: 'foto.jpg' });
    const tool = registry.get('downloadMedia');
    const result = await tool.execute({ mediaId: 'm1' });
    expect(result.url).toBe('https://cdn.com/img');
  });

  it('downloadMedia without service', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('downloadMedia');
    const result = await tool.execute({ mediaId: 'm1' });
    expect(result.error).toBe('WhatsAppService not available');
  });

  it('markAsRead marks message as read', async () => {
    ws.markAsRead.mockResolvedValue({ success: true });
    const tool = registry.get('markAsRead');
    const result = await tool.execute({ messageId: 'wa-msg' });
    expect(result.success).toBe(true);
  });

  it('markAsRead without service', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('markAsRead');
    const result = await tool.execute({ messageId: 'wa-msg' });
    expect(result.error).toBe('WhatsAppService not available');
  });

  it('typingIndicator sends typing action', async () => {
    ws.sendTypingIndicator.mockResolvedValue({ success: true });
    const tool = registry.get('typingIndicator');
    const result = await tool.execute({ phone: '5492645555' });
    expect(result.success).toBe(true);
  });

  it('typingIndicator without service', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('typingIndicator');
    const result = await tool.execute({ phone: '5492645555' });
    expect(result.error).toBe('WhatsAppService not available');
  });

  it('searchConversationByPhone finds conversations', async () => {
    cm.createConversation({ conversationId: 'c1', phone: '5492645555', clientName: 'Juan' });
    const tool = registry.get('searchConversationByPhone');
    const result = await tool.execute({ phone: '5492645555' });
    expect(result).toHaveLength(1);
  });

  it('searchConversationByPhone without manager', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('searchConversationByPhone');
    const result = await tool.execute({ phone: '5492645555' });
    expect(result.error).toBe('ConversationManager not available');
  });

  it('createConversation creates new conversation', async () => {
    const tool = registry.get('createConversation');
    const result = await tool.execute({ phone: '5492645555', clientName: 'Nuevo' });
    expect(result.phone).toBe('5492645555');
    expect(result.clientName).toBe('Nuevo');
    expect(result.status).toBe('active');
  });

  it('createConversation without manager', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('createConversation');
    const result = await tool.execute({ phone: '5492645555' });
    expect(result.error).toBe('ConversationManager not available');
  });

  it('closeConversation closes conversation', async () => {
    cm.createConversation({ conversationId: 'c1' });
    const tool = registry.get('closeConversation');
    const result = await tool.execute({ conversationId: 'c1' });
    expect(result.status).toBe('resolved');
  });

  it('closeConversation returns error for missing', async () => {
    const tool = registry.get('closeConversation');
    const result = await tool.execute({ conversationId: 'none' });
    expect(result.error).toBe('Conversation not found');
  });

  it('closeConversation without manager', async () => {
    const reg = new ToolRegistry();
    registerWhatsAppRealTools(reg, {});
    const tool = reg.get('closeConversation');
    const result = await tool.execute({ conversationId: 'c1' });
    expect(result.error).toBe('ConversationManager not available');
  });

  it('all tools are registered', () => {
    expect(registry.exists('receiveWhatsApp')).toBe(true);
    expect(registry.exists('sendWhatsAppReal')).toBe(true);
    expect(registry.exists('downloadMedia')).toBe(true);
    expect(registry.exists('markAsRead')).toBe(true);
    expect(registry.exists('typingIndicator')).toBe(true);
    expect(registry.exists('searchConversationByPhone')).toBe(true);
    expect(registry.exists('createConversation')).toBe(true);
    expect(registry.exists('closeConversation')).toBe(true);
  });
});
