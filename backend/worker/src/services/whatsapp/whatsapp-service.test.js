import { describe, it, expect, vi } from 'vitest';
import { WhatsAppService } from './whatsapp-service.js';

describe('WhatsAppService', () => {
  it('creates service with mock config', () => {
    const ws = new WhatsAppService({ config: { WHATSAPP_PROVIDER: 'mock' } });
    expect(ws.metrics).toBeDefined();
  });

  it('creates service with meta config', () => {
    const ws = new WhatsAppService({
      config: { WHATSAPP_PROVIDER: 'meta', WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: 'p' },
    });
    expect(ws.channel).toBeDefined();
  });

  it('sendMessage delegates to channel and tracks metrics', async () => {
    const channel = { send: vi.fn().mockResolvedValue({ success: true, id: 'wa-1' }) };
    const ws = new WhatsAppService({ channel });
    const result = await ws.sendMessage('5492645555', 'Hola');
    expect(result.success).toBe(true);
    expect(ws.metrics.sent).toBe(1);
  });

  it('sendMessage tracks errors', async () => {
    const channel = { send: vi.fn().mockRejectedValue(new Error('fail')) };
    const ws = new WhatsAppService({ channel });
    await expect(ws.sendMessage('5492645555', 'Hola')).rejects.toThrow();
    expect(ws.metrics.errors).toBe(1);
  });

  it('sendTemplate delegates to channel', async () => {
    const channel = { sendTemplate: vi.fn().mockResolvedValue({ success: true, template: 'welcome' }) };
    const ws = new WhatsAppService({ channel });
    const result = await ws.sendTemplate('5492645555', 'welcome', []);
    expect(result.template).toBe('welcome');
  });

  it('markAsRead delegates', async () => {
    const channel = { markAsRead: vi.fn().mockResolvedValue({ success: true }) };
    const ws = new WhatsAppService({ channel });
    const result = await ws.markAsRead('msg-1');
    expect(result.success).toBe(true);
  });

  it('sendTypingIndicator delegates', async () => {
    const channel = { sendTypingIndicator: vi.fn().mockResolvedValue({ success: true }) };
    const ws = new WhatsAppService({ channel });
    const result = await ws.sendTypingIndicator('5492645555');
    expect(result.success).toBe(true);
  });

  it('downloadMedia delegates', async () => {
    const mh = { downloadMedia: vi.fn().mockResolvedValue({ mediaId: 'm1' }) };
    const ws = new WhatsAppService({ mediaHandler: mh });
    const result = await ws.downloadMedia('m1');
    expect(result.mediaId).toBe('m1');
  });

  it('getMediaUrl delegates', async () => {
    const mh = { getMediaUrl: vi.fn().mockResolvedValue({ url: 'https://cdn.com/img' }) };
    const ws = new WhatsAppService({ mediaHandler: mh });
    const result = await ws.getMediaUrl('m1');
    expect(result.url).toBe('https://cdn.com/img');
  });

  it('handleWebhookGet delegates', async () => {
    const wh = { handleGet: vi.fn().mockResolvedValue(new Response('ok')) };
    const ws = new WhatsAppService({ webhookHandler: wh });
    const response = await ws.handleWebhookGet(new Request('http://example.com?hub.mode=subscribe&hub.verify_token=t&hub.challenge=123'), {});
    expect(response.status).toBe(200);
  });

  it('handleWebhookPost delegates and tracks received', async () => {
    const wh = { handlePost: vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 })) };
    const ws = new WhatsAppService({ webhookHandler: wh });
    const response = await ws.handleWebhookPost(new Request('http://example.com', { method: 'POST', body: '{}' }), {});
    expect(response.status).toBe(200);
    expect(ws.metrics.received).toBe(1);
  });

  it('resetMetrics clears all metrics', async () => {
    const channel = { send: vi.fn().mockResolvedValue({ success: true }) };
    const ws = new WhatsAppService({ config: {}, channel });
    await ws.sendMessage('5492645555', 'test');
    expect(ws.metrics.sent).toBe(1);
    ws.resetMetrics();
    expect(ws.metrics.sent).toBe(0);
  });

  it('getProcessedCount returns idempotency count', () => {
    const ws = new WhatsAppService({});
    expect(ws.getProcessedCount()).toBe(0);
  });

  it('exposes all sub-services', () => {
    const channel = { send: vi.fn() };
    const ws = new WhatsAppService({ channel });
    expect(ws.parser).toBeDefined();
    expect(ws.validator).toBeDefined();
  });
});
