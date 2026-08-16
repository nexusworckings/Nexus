import { describe, it, expect } from 'vitest';
import { WhatsAppChannel } from './whatsapp-channel.js';

describe('WhatsAppChannel (abstract base)', () => {
  it('can be instantiated', () => {
    const c = new WhatsAppChannel();
    expect(c).toBeInstanceOf(WhatsAppChannel);
  });

  it('send throws by default', async () => {
    const c = new WhatsAppChannel();
    await expect(c.send({ phone: '+54', message: 'Test' })).rejects.toThrow('must be implemented by subclass');
  });

  it('send throws with specific error message', async () => {
    const c = new WhatsAppChannel();
    try {
      await c.send({ phone: '+54', message: 'Test' });
    } catch (e) {
      expect(e.message).toContain('WhatsAppChannel');
      expect(e.message).toContain('send()');
    }
  });

  it('subclass can override send', async () => {
    class FakeChannel extends WhatsAppChannel {
      async send({ phone, message }) {
        return { success: true, phone, message };
      }
    }
    const c = new FakeChannel();
    const result = await c.send({ phone: '+54', message: 'Hola' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Hola');
  });

  it('subclass can add phone formatting', async () => {
    class FormattedChannel extends WhatsAppChannel {
      async send({ phone, message }) {
        const formatted = phone.startsWith('+') ? phone : `+54${phone}`;
        return { success: true, phone: formatted, message };
      }
    }
    const c = new FormattedChannel();
    const result = await c.send({ phone: '3405480010', message: 'Test' });
    expect(result.phone).toBe('+543405480010');
  });
});
