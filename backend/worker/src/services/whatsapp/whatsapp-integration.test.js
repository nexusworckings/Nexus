import { describe, it, expect, vi } from 'vitest';
import { WhatsAppService } from './whatsapp-service.js';
import { MetaWhatsAppChannel } from './meta-whatsapp-channel.js';
import { ConversationManager } from '../nexus/conversation-manager.js';
import { ConversationMemory } from '../nexus/conversation-memory.js';

describe('WhatsApp Integration', () => {
  it('full flow: message received via webhook creates conversation', async () => {
    const cm = new ConversationManager();
    const mem = new ConversationMemory();
    const channel = { markAsRead: vi.fn(), send: vi.fn() };
    const cr = { resolveOrCreate: vi.fn().mockResolvedValue({ clientId: 'cli-1', clientName: 'Juan', existed: false, client: { id: 'cli-1' } }) };

    const ws = new WhatsAppService({
      channel,
      contactResolver: cr,
      conversationManager: cm,
      conversationMemory: mem,
      config: { WEBHOOK_VERIFY_TOKEN: 'test' },
    });

    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wa-int-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Hola necesito ayuda' } }], contacts: [{ profile: { name: 'Juan' } }] } }] }],
    };

    const request = new Request('http://example.com/webhook', {
      method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' },
    });

    const response = await ws.handleWebhookPost(request, {});
    expect(response.status).toBe(200);

    const convs = cm.getConversationsByPhone('5492645555');
    expect(convs).toHaveLength(1);
    expect(convs[0].clientName).toBe('Juan');
    expect(convs[0].history).toHaveLength(1);
    expect(convs[0].history[0].content).toBe('Hola necesito ayuda');
  });

  it('full flow: duplicate message detection', async () => {
    const cm = new ConversationManager();
    const ws = new WhatsAppService({
      conversationManager: cm,
      config: { WEBHOOK_VERIFY_TOKEN: 'test' },
    });

    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wa-dup-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Test' } }], contacts: [{ profile: { name: 'Test' } }] } }] }],
    };

    const req1 = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    await ws.handleWebhookPost(req1, {});
    const req2 = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    const response = await ws.handleWebhookPost(req2, {});
    const data = await response.json();
    expect(data.results[0].skipped).toBe(true);
  });

  it('full flow: message from existing conversation', async () => {
    const cm = new ConversationManager();
    cm.createConversation({ conversationId: 'existing-c1', phone: '5492645555', clientName: 'Maria', channel: 'whatsapp' });

    const ws = new WhatsAppService({
      conversationManager: cm,
      config: { WEBHOOK_VERIFY_TOKEN: 'test' },
    });

    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wa-exist-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Ya vine' } }], contacts: [{ profile: { name: 'Maria' } }] } }] }],
    };

    const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    const response = await ws.handleWebhookPost(request, {});
    const data = await response.json();
    expect(data.results[0].isNewConversation).toBe(false);

    const conv = cm.getConversation('existing-c1');
    expect(conv.history).toHaveLength(1);
  });

  it('full flow: auto-reply when runtime available', async () => {
    const cm = new ConversationManager();
    const channel = { markAsRead: vi.fn(), send: vi.fn().mockResolvedValue({ success: true }) };
    const runtime = { handleMessage: vi.fn().mockResolvedValue({ type: 'chat', message: 'Hola, en que puedo ayudarte?' }) };

    const ws = new WhatsAppService({
      conversationManager: cm,
      channel,
      runtime,
      config: { WEBHOOK_VERIFY_TOKEN: 'test' },
    });

    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wa-auto-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Hola' } }], contacts: [{ profile: { name: 'Carlos' } }] } }] }],
    };

    const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    const response = await ws.handleWebhookPost(request, {});
    expect(response.status).toBe(200);

    expect(channel.send).toHaveBeenCalled();
    expect(channel.markAsRead).toHaveBeenCalled();
  });

  it('full flow: send message via service', async () => {
    const channel = { send: vi.fn().mockResolvedValue({ success: true, id: 'wa-sent-1' }) };
    const ws = new WhatsAppService({ channel });
    const result = await ws.sendMessage('5492645555', 'Mensaje de prueba');
    expect(result.success).toBe(true);
    expect(channel.send).toHaveBeenCalledWith({ phone: '5492645555', message: 'Mensaje de prueba', metadata: undefined });
  });

  it('full flow: webhook verification', async () => {
    const ws = new WhatsAppService({ config: { WEBHOOK_VERIFY_TOKEN: 'my_verify_token' } });
    const url = 'http://example.com/webhook?hub.mode=subscribe&hub.verify_token=my_verify_token&hub.challenge=999';
    const request = new Request(url);
    const response = await ws.handleWebhookGet(request, {});
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('999');
  });

  it('full flow: metrics tracking after operations', async () => {
    const channel = { send: vi.fn().mockResolvedValue({ success: true }) };
    const ws = new WhatsAppService({ channel });

    await ws.sendMessage('5492645555', 'Msg 1');
    await ws.sendMessage('5492645555', 'Msg 2');

    const metrics = ws.metrics;
    expect(metrics.sent).toBe(2);
    expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('full flow: multiple webhook calls maintain state', async () => {
    const cm = new ConversationManager();
    const ws = new WhatsAppService({
      conversationManager: cm,
      config: { WEBHOOK_VERIFY_TOKEN: 'test' },
    });

    for (let i = 0; i < 5; i++) {
      const payload = {
        entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: `wa-multi-${i}`, from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: `Mensaje ${i}` } }], contacts: [{ profile: { name: 'Test' } }] } }] }],
      };
      const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
      await ws.handleWebhookPost(request, {});
    }

    const convs = cm.getConversationsByPhone('5492645555');
    expect(convs).toHaveLength(1);
    expect(convs[0].history).toHaveLength(5);
  });

  it('full flow: idempotency limit management', async () => {
    const processedIds = new Set();
    for (let i = 0; i < 9990; i++) processedIds.add(`old-${i}`);

    const cm = new ConversationManager();
    const ws = new WhatsAppService({
      conversationManager: cm,
      processedIds,
      config: { WEBHOOK_VERIFY_TOKEN: 'test' },
    });

    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wa-limit-test', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Test' } }], contacts: [{ profile: { name: 'Test' } }] } }] }],
    };

    const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    await ws.handleWebhookPost(request, {});
    expect(ws.getProcessedCount()).toBeLessThanOrEqual(10000);
  });

  it('contact resolver integration with service', async () => {
    const cr = {
      resolveOrCreate: vi.fn().mockResolvedValue({ clientId: 'cli-new', clientName: 'Nuevo', existed: false, client: { id: 'cli-new', name: 'Nuevo' } }),
    };
    const cm = new ConversationManager();
    const ws = new WhatsAppService({ contactResolver: cr, conversationManager: cm, config: { WEBHOOK_VERIFY_TOKEN: 'test' } });

    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wa-cr-1', from: '5492649999', timestamp: '1700000000', type: 'text', text: { body: 'Soy nuevo' } }], contacts: [{ profile: { name: 'Nuevo Cliente' } }] } }] }],
    };

    const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    const response = await ws.handleWebhookPost(request, {});
    const data = await response.json();
    expect(data.results[0].isNewClient).toBe(true);
  });
});
