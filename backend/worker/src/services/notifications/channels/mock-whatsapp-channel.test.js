import { describe, it, expect, beforeEach } from 'vitest';
import { MockWhatsAppChannel } from './mock-whatsapp-channel.js';

describe('MockWhatsAppChannel', () => {
  let channel;

  beforeEach(() => {
    channel = new MockWhatsAppChannel();
  });

  describe('send', () => {
    it('sends a WhatsApp message', async () => {
      const result = await channel.send({
        phone: '+543405480010',
        message: 'Hola Juan.\nTu reparación cambió a: Reparando.\nTecno San Juan.',
        metadata: { eventType: 'REPAIR_STATUS_CHANGED' },
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe(1);
      expect(result.phone).toBe('+543405480010');
    });

    it('throws when phone is missing', async () => {
      await expect(channel.send({ message: 'Hola' })).rejects.toThrow('phone is required');
    });

    it('throws when phone is empty', async () => {
      await expect(channel.send({ phone: '', message: 'Hola' })).rejects.toThrow('phone is required');
    });

    it('increments id on each send', async () => {
      await channel.send({ phone: '+54', message: 'Msg 1' });
      await channel.send({ phone: '+54', message: 'Msg 2' });
      const sent = channel.getSent();
      expect(sent[0].id).toBe(1);
      expect(sent[1].id).toBe(2);
    });

    it('records timestamp on send', async () => {
      await channel.send({ phone: '+54', message: 'Test' });
      const sent = channel.getSent();
      expect(sent[0].sentAt).toBeTruthy();
      expect(() => new Date(sent[0].sentAt)).not.toThrow();
    });

    it('defaults metadata to empty object', async () => {
      await channel.send({ phone: '+54', message: 'Test' });
      const sent = channel.getSent();
      expect(sent[0].metadata).toEqual({});
    });

    it('stores full message content', async () => {
      await channel.send({ phone: '+54', message: 'Hola Juan.\nTu reparación cambió a: Reparando.\nTecno San Juan.', metadata: {} });
      const sent = channel.getSent();
      expect(sent[0].message).toContain('Hola Juan');
      expect(sent[0].message).toContain('Reparando');
    });
  });

  describe('getSent', () => {
    it('returns empty array when no messages sent', () => {
      expect(channel.getSent()).toEqual([]);
    });

    it('returns copy of sent messages', async () => {
      await channel.send({ phone: '+54', message: 'Test' });
      const sent = channel.getSent();
      sent.length = 0;
      expect(channel.getSent().length).toBe(1);
    });

    it('returns all sent messages in order', async () => {
      await channel.send({ phone: '+54', message: 'First' });
      await channel.send({ phone: '+55', message: 'Second' });
      const sent = channel.getSent();
      expect(sent.length).toBe(2);
      expect(sent[0].phone).toBe('+54');
      expect(sent[1].phone).toBe('+55');
    });
  });

  describe('getSentByPhone', () => {
    it('returns messages filtered by phone', async () => {
      await channel.send({ phone: '+54', message: 'To Juan' });
      await channel.send({ phone: '+55', message: 'To Maria' });
      await channel.send({ phone: '+54', message: 'Another to Juan' });

      const juanMsgs = channel.getSentByPhone('+54');
      expect(juanMsgs.length).toBe(2);
      expect(juanMsgs[0].phone).toBe('+54');
      expect(juanMsgs[1].phone).toBe('+54');
    });

    it('returns empty array when phone has no messages', () => {
      const msgs = channel.getSentByPhone('+999');
      expect(msgs).toEqual([]);
    });
  });

  describe('send errors', () => {
    it('throws when phone is null', async () => {
      await expect(channel.send({ phone: null, message: 'Test' })).rejects.toThrow('phone is required');
    });

    it('throws when message is empty', async () => {
      await expect(channel.send({ phone: '+54', message: '' })).resolves.toBeTruthy();
    });

    it('handles special characters in message', async () => {
      const result = await channel.send({ phone: '+54', message: 'Hola! ¿Cómo estás? 🛠️' });
      expect(result.success).toBe(true);
      const sent = channel.getSent();
      expect(sent[0].message).toContain('Hola!');
    });
  });

  describe('send with metadata', () => {
    it('stores metadata with sent message', async () => {
      await channel.send({ phone: '+54', message: 'Test', metadata: { eventType: 'REPAIR_STATUS_CHANGED', repairId: 'r1' } });
      const sent = channel.getSent();
      expect(sent[0].metadata.eventType).toBe('REPAIR_STATUS_CHANGED');
      expect(sent[0].metadata.repairId).toBe('r1');
    });

    it('handles null metadata', async () => {
      await channel.send({ phone: '+54', message: 'Test', metadata: null });
      const sent = channel.getSent();
      expect(sent[0].metadata).toEqual({});
    });

    it('handles undefined metadata', async () => {
      await channel.send({ phone: '+54', message: 'Test' });
      const sent = channel.getSent();
      expect(sent[0].metadata).toEqual({});
    });
  });

  describe('clear', () => {
    it('clears all sent messages', async () => {
      await channel.send({ phone: '+54', message: 'Test' });
      channel.clear();
      expect(channel.getSent()).toEqual([]);
    });

    it('allows sending after clear', async () => {
      await channel.send({ phone: '+54', message: 'Before' });
      channel.clear();
      await channel.send({ phone: '+55', message: 'After' });
      expect(channel.getSent().length).toBe(1);
      expect(channel.getSent()[0].phone).toBe('+55');
    });
  });
});
