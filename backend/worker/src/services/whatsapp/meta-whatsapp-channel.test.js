import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaWhatsAppChannel } from './meta-whatsapp-channel.js';

describe('MetaWhatsAppChannel', () => {
  let channel;
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    channel = new MetaWhatsAppChannel({
      token: 'test-token',
      phoneNumberId: '123456',
      apiVersion: 'v22.0',
    });
  });

  it('constructor sets defaults', () => {
    const c = new MetaWhatsAppChannel({ token: 't', phoneNumberId: 'p' });
    expect(c.apiVersion).toBe('v22.0');
    expect(c.phoneNumberId).toBe('p');
  });

  it('send throws without phone', async () => {
    await expect(channel.send({})).rejects.toThrow('phone is required');
  });

  it('send makes API call and returns result', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-123' }] }),
    });
    const result = await channel.send({ phone: '5492645555', message: 'Hola' });
    expect(result.success).toBe(true);
    expect(result.id).toBe('wa-123');
    expect(result.provider).toBe('meta');
  });

  it('send retries on 429 rate limit', async () => {
    mockFetch
      .mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429, code: 130429 }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wa-456' }] }),
      });
    const result = await channel.send({ phone: '5492645555', message: 'Hola' });
    expect(result.success).toBe(true);
    expect(result.id).toBe('wa-456');
  });

  it('send retries on 500', async () => {
    mockFetch
      .mockRejectedValueOnce(Object.assign(new Error('Server error'), { status: 500 }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wa-789' }] }),
      });
    const result = await channel.send({ phone: '5492645555', message: 'Hola' });
    expect(result.success).toBe(true);
  });

  it('send throws after max retries', async () => {
    mockFetch.mockRejectedValue(Object.assign(new Error('Server error'), { status: 500 }));
    await expect(channel.send({ phone: '5492645555', message: 'Hola' })).rejects.toThrow();
  });

  it('send normalizes Argentine phone', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-1' }] }),
    });
    await channel.send({ phone: '2645555', message: 'Hola' });
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.to).toBe('5492645555');
  });

  it('sendTemplate makes template API call', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-tpl' }] }),
    });
    const result = await channel.sendTemplate({
      phone: '5492645555',
      templateName: 'repair_ready',
      language: 'es_AR',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Juan' }] }],
    });
    expect(result.success).toBe(true);
    expect(result.template).toBe('repair_ready');
  });

  it('markAsRead sends read status', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await channel.markAsRead('wa-msg-1');
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('wa-msg-1');
  });

  it('sendTypingIndicator sends action', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await channel.sendTypingIndicator('5492645555', 'typing');
    expect(result.success).toBe(true);
    expect(result.action).toBe('typing');
  });

  it('sendTypingIndicator defaults to typing', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await channel.sendTypingIndicator('5492645555');
    expect(result.action).toBe('typing');
  });

  it('downloadMedia downloads and returns data', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://cdn.example.com/media', mime_type: 'image/jpeg', file_size: 12345, filename: 'photo.jpg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });
    const result = await channel.downloadMedia('media-id-1');
    expect(result.mediaId).toBe('media-id-1');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileSize).toBe(12345);
  });

  it('downloadMedia throws without mediaId', async () => {
    await expect(channel.downloadMedia()).rejects.toThrow('mediaId is required');
  });

  it('getMediaUrl returns media info', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://cdn.example.com/media', mime_type: 'application/pdf', file_size: 5000, filename: 'doc.pdf' }),
    });
    const result = await channel.getMediaUrl('media-pdf-1');
    expect(result.url).toBe('https://cdn.example.com/media');
    expect(result.mimeType).toBe('application/pdf');
  });

  it('verifyWebhookToken returns success on match', async () => {
    const result = await channel.verifyWebhookToken('subscribe', 'valid-token', 'valid-token');
    expect(result.success).toBe(true);
  });

  it('verifyWebhookToken returns failure on mismatch', async () => {
    const result = await channel.verifyWebhookToken('subscribe', 'wrong', 'valid-token');
    expect(result.success).toBe(false);
  });

  it('handles API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error": {"message": "Invalid phone", "code": 1003}}',
    });
    await expect(channel.send({ phone: 'invalid', message: 'Hola' })).rejects.toThrow();
  });

  it('handles timeout', async () => {
    const fastChannel = new MetaWhatsAppChannel({ token: 't', phoneNumberId: 'p', timeout: 1 });
    mockFetch.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      throw new Error('The operation was aborted');
    });
    await expect(fastChannel.send({ phone: '5492645555', message: 'Hola' })).rejects.toThrow();
  });

  it('rate limiter delays when near limit', async () => {
    const rateChannel = new MetaWhatsAppChannel({ token: 't', phoneNumberId: 'p', rateLimitPerSecond: 2 });
    rateChannel.setRequestTimestamps([Date.now(), Date.now(), Date.now()]);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wa-1' }] }) });
    const start = Date.now();
    await rateChannel.send({ phone: '5492645555', message: 'Hola' });
    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });
});
