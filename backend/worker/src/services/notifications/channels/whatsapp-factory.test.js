import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWhatsAppChannel } from './whatsapp-factory.js';
import { MockWhatsAppChannel } from './mock-whatsapp-channel.js';
import { WhatsAppChannel } from './whatsapp-channel.js';

describe('createWhatsAppChannel', () => {
  it('returns MockWhatsAppChannel by default', () => {
    const channel = createWhatsAppChannel();
    expect(channel).toBeInstanceOf(MockWhatsAppChannel);
  });

  it('returns MockWhatsAppChannel when provider is mock', () => {
    const channel = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'mock' });
    expect(channel).toBeInstanceOf(MockWhatsAppChannel);
  });

  it('returns MockWhatsAppChannel when provider is mock (lowercase config)', () => {
    const channel = createWhatsAppChannel({ provider: 'mock' });
    expect(channel).toBeInstanceOf(MockWhatsAppChannel);
  });

  it('returns WhatsAppChannel base class for unknown provider', () => {
    const channel = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'meta' });
    expect(channel).toBeInstanceOf(WhatsAppChannel);
  });

  it('returns WhatsAppChannel base class for meta provider', () => {
    const channel = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'meta' });
    expect(channel).not.toBeInstanceOf(MockWhatsAppChannel);
  });

  it('returns WhatsAppChannel for twilio provider', () => {
    const channel = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'twilio' });
    expect(channel).toBeInstanceOf(WhatsAppChannel);
  });

  it('passes config forward for real provider', () => {
    const channel = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'meta', WHATSAPP_DEFAULT_COUNTRY: 'AR' });
    expect(channel).toBeInstanceOf(WhatsAppChannel);
  });

  it('creates usable mock channel', async () => {
    const channel = createWhatsAppChannel({ provider: 'mock' });
    const result = await channel.send({ phone: '+54', message: 'Test' });
    expect(result.success).toBe(true);
    const sent = channel.getSent();
    expect(sent.length).toBe(1);
  });

  it('returns MetaWhatsAppChannel for meta provider', () => {
    const channel = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'meta' });
    expect(channel.constructor.name).toBe('MetaWhatsAppChannel');
  });

  it('uses WHATSAPP_PROVIDER env var format', () => {
    const c = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'mock' });
    expect(c).toBeInstanceOf(MockWhatsAppChannel);
  });

  it('uses provider config key format', () => {
    const c = createWhatsAppChannel({ provider: 'mock' });
    expect(c).toBeInstanceOf(MockWhatsAppChannel);
  });

  it('provider config takes precedence over env var', () => {
    const c = createWhatsAppChannel({ WHATSAPP_PROVIDER: 'meta', provider: 'mock' });
    expect(c).toBeInstanceOf(MockWhatsAppChannel);
  });

  it('returns mock when config is empty object', () => {
    const c = createWhatsAppChannel({});
    expect(c).toBeInstanceOf(MockWhatsAppChannel);
  });

  it('returned mock channel has working send and history', async () => {
    const c = createWhatsAppChannel();
    await c.send({ phone: '+54', message: 'Msg 1' });
    await c.send({ phone: '+55', message: 'Msg 2' });
    const sent = c.getSent();
    expect(sent.length).toBe(2);
    expect(sent[0].phone).toBe('+54');
    expect(sent[1].phone).toBe('+55');
  });

  it('returned mock can be cleared', async () => {
    const c = createWhatsAppChannel({ provider: 'mock' });
    await c.send({ phone: '+54', message: 'Test' });
    c.clear();
    expect(c.getSent()).toEqual([]);
  });

  it('channel for unknown provider returns MetaWhatsAppChannel', () => {
    const c = createWhatsAppChannel({ provider: 'unknown_provider' });
    expect(c.constructor.name).toBe('MetaWhatsAppChannel');
  });
});
