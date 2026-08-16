import { describe, it, expect, vi } from 'vitest';
import { WebhookHandler } from './webhook-handler.js';
import { WebhookValidator } from './webhook-validator.js';
import { MessageParser } from './message-parser.js';

describe('WebhookHandler', () => {
  const makePayload = (msg) => ({
    entry: [{ changes: [{ field: 'messages', value: { messages: [msg], contacts: [{ profile: { name: 'Test' } }], metadata: {} } }] }],
  });

  it('handleGet verifies webhook', async () => {
    const v = new WebhookValidator({ verifyToken: 'verify_me' });
    const wh = new WebhookHandler({ validator: v });
    const url = 'http://example.com/webhook?hub.mode=subscribe&hub.verify_token=verify_me&hub.challenge=12345';
    const request = new Request(url);
    const response = await wh.handleGet(request, {});
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('12345');
  });

  it('handleGet fails on wrong token', async () => {
    const v = new WebhookValidator({ verifyToken: 'verify_me' });
    const wh = new WebhookHandler({ validator: v });
    const url = 'http://example.com/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345';
    const request = new Request(url);
    const response = await wh.handleGet(request, {});
    expect(response.status).toBe(403);
  });

  it('handlePost processes incoming message', async () => {
    const cm = { getConversationsByPhone: vi.fn().mockReturnValue([]), createConversation: vi.fn().mockReturnValue({ conversationId: 'c1', addMessage: vi.fn() }) };
    const mem = { remember: vi.fn() };
    const cr = { resolveOrCreate: vi.fn().mockResolvedValue({ clientId: 'cli-1', clientName: 'Juan', existed: false, client: { id: 'cli-1' } }) };

    const wh = new WebhookHandler({
      validator: new WebhookValidator({ verifyToken: 't' }),
      parser: new MessageParser(),
      contactResolver: cr,
      conversationManager: cm,
      conversationMemory: mem,
    });

    const body = makePayload({ id: 'msg-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Hola' } });
    const request = new Request('http://example.com/webhook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await wh.handlePost(request, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results[0].status).toBe('processed');
    expect(data.results[0].messageId).toBe('msg-1');
  });

  it('handlePost skips duplicate messages', async () => {
    const cm = { getConversationsByPhone: vi.fn().mockReturnValue([]), createConversation: vi.fn().mockReturnValue({ conversationId: 'c1', addMessage: vi.fn() }) };
    const wh = new WebhookHandler({
      validator: new WebhookValidator({ verifyToken: 't' }),
      parser: new MessageParser(),
      conversationManager: cm,
      processedIds: new Set(['msg-dup']),
    });

    const body = makePayload({ id: 'msg-dup', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Duplicado' } });
    const request = new Request('http://example.com/webhook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await wh.handlePost(request, {});
    const data = await response.json();
    expect(data.results[0].skipped).toBe(true);
    expect(data.results[0].status).toBe('duplicate');
  });

  it('handlePost skips status messages', async () => {
    const payload = {
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'status-1', recipient_id: '5492645555', timestamp: '1700000000', status: 'read' }] } }] }],
    };
    const wh = new WebhookHandler({ validator: new WebhookValidator({ verifyToken: 't' }), parser: new MessageParser() });
    const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    const response = await wh.handlePost(request, {});
    const data = await response.json();
    expect(data.results).toEqual([]);
  });

  it('handlePost invalid JSON returns 400', async () => {
    const wh = new WebhookHandler({ validator: new WebhookValidator({ verifyToken: 't' }), parser: new MessageParser() });
    const request = new Request('http://example.com/webhook', { method: 'POST', body: 'invalid json', headers: { 'Content-Type': 'application/json' } });
    const response = await wh.handlePost(request, {});
    expect(response.status).toBe(400);
  });

  it('handlePost rejects invalid signature when appSecret present', async () => {
    const wh = new WebhookHandler({ validator: new WebhookValidator({ verifyToken: 't' }), parser: new MessageParser() });
    const body = makePayload({ id: 'msg-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'test' } });
    const request = new Request('http://example.com/webhook', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' },
    });
    const response = await wh.handlePost(request, { WHATSAPP_APP_SECRET: 'my_secret' });
    expect(response.status).toBe(403);
  });

  it('handlePost reuses existing conversation by phone', async () => {
    const existingConv = { conversationId: 'existing-c1', addMessage: vi.fn() };
    const cm = { getConversationsByPhone: vi.fn().mockReturnValue([existingConv]) };
    const cr = { resolveOrCreate: vi.fn().mockResolvedValue({ clientId: 'cli-1', clientName: 'Juan', existed: true, client: {} }) };
    const wh = new WebhookHandler({
      validator: new WebhookValidator({ verifyToken: 't' }),
      parser: new MessageParser(),
      conversationManager: cm,
      contactResolver: cr,
    });

    const body = makePayload({ id: 'msg-2', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Ya vine' } });
    const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    const response = await wh.handlePost(request, {});
    const data = await response.json();
    expect(data.results[0].isNewConversation).toBe(false);
    expect(existingConv.addMessage).toHaveBeenCalled();
  });

  it('empty results for empty payload', async () => {
    const wh = new WebhookHandler({ validator: new WebhookValidator({ verifyToken: 't' }), parser: new MessageParser() });
    const request = new Request('http://example.com/webhook', { method: 'POST', body: JSON.stringify({ entry: [] }), headers: { 'Content-Type': 'application/json' } });
    const response = await wh.handlePost(request, {});
    const data = await response.json();
    expect(data.results).toEqual([]);
  });
});
