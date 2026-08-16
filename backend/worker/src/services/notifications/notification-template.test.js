import { describe, it, expect } from 'vitest';
import {
  getEmailTemplate, getWhatsAppTemplate,
  fillTemplateFn, buildMessage, buildWhatsAppMessage,
} from './notification-template.js';

describe('notification-template', () => {
  describe('getEmailTemplate', () => {
    it('returns template for CLIENT_CREATED', () => {
      const t = getEmailTemplate('CLIENT_CREATED');
      expect(t).not.toBeNull();
      expect(t.subject).toBe('Nuevo cliente registrado');
    });

    it('returns template for REPAIR_CREATED', () => {
      const t = getEmailTemplate('REPAIR_CREATED');
      expect(t.subject).toBe('Reparación recibida');
    });

    it('returns null for unknown event type', () => {
      expect(getEmailTemplate('UNKNOWN')).toBeNull();
    });
  });

  describe('getWhatsAppTemplate', () => {
    it('returns WhatsApp template for CLIENT_CREATED', () => {
      const t = getWhatsAppTemplate('CLIENT_CREATED');
      expect(t).not.toBeNull();
      expect(t.message).toContain('Tecno San Juan');
    });

    it('returns WhatsApp template for REPAIR_STATUS_CHANGED', () => {
      const t = getWhatsAppTemplate('REPAIR_STATUS_CHANGED');
      expect(t).not.toBeNull();
      expect(t.message).toContain('{{newStatus}}');
    });

    it('returns WhatsApp template with shorter message', () => {
      const t = getWhatsAppTemplate('REPAIR_CREATED');
      expect(t.message.length).toBeLessThan(80);
      expect(t.message).toContain('Recibimos tu equipo');
    });

    it('returns null for unknown event type', () => {
      expect(getWhatsAppTemplate('UNKNOWN')).toBeNull();
    });

    it('whatsapp template has no subject field', () => {
      const t = getWhatsAppTemplate('CLIENT_CREATED');
      expect(t.subject).toBeUndefined();
    });

    it('returns templates for all known event types', () => {
      const types = ['CLIENT_CREATED', 'REPAIR_CREATED', 'REPAIR_STATUS_CHANGED',
        'BUDGET_CREATED', 'BUDGET_APPROVED', 'BUDGET_REJECTED',
        'PRINT_ORDER_CREATED', 'PRINT_ORDER_STATUS_CHANGED'];
      for (const type of types) {
        expect(getWhatsAppTemplate(type)).not.toBeNull();
      }
    });
  });

  describe('fillTemplateFn', () => {
    it('replaces placeholders with values', () => {
      const template = { subject: 'Hola {{name}}', message: 'Hola {{name}}, tu pedido {{id}}' };
      const result = fillTemplateFn(template, { name: 'Juan', id: '123' });
      expect(result.subject).toBe('Hola Juan');
      expect(result.message).toBe('Hola Juan, tu pedido 123');
    });

    it('handles missing values', () => {
      const template = { subject: 'Hola {{name}}', message: 'Test' };
      const result = fillTemplateFn(template, {});
      expect(result.subject).toBe('Hola {{name}}');
      expect(result.message).toBe('Test');
    });

    it('handles null values', () => {
      const template = { subject: 'Hola {{name}}', message: 'Status: {{status}}' };
      const result = fillTemplateFn(template, { name: null, status: 'ok' });
      expect(result.subject).toBe('Hola ');
      expect(result.message).toBe('Status: ok');
    });

    it('returns empty strings for null template', () => {
      const result = fillTemplateFn(null, { name: 'Juan' });
      expect(result.subject).toBe('');
      expect(result.message).toBe('');
    });

    it('works with message-only templates (whatsapp style)', () => {
      const template = { message: 'Hola {{name}}.\nTu estado: {{status}}.\nTecno San Juan.' };
      const result = fillTemplateFn(template, { name: 'Ana', status: 'completado' });
      expect(result.message).toContain('Ana');
      expect(result.message).toContain('completado');
      expect(result.message).toContain('Tecno San Juan');
    });
  });

  describe('buildMessage', () => {
    it('builds complete message for REPAIR_CREATED', () => {
      const msg = buildMessage('REPAIR_CREATED', 'Juan', { device: 'Samsung' });
      expect(msg.subject).toBe('Reparación recibida');
      expect(msg.message).toContain('Juan');
      expect(msg.message).toContain('recibimos tu equipo');
    });

    it('builds complete message for REPAIR_STATUS_CHANGED', () => {
      const msg = buildMessage('REPAIR_STATUS_CHANGED', 'Maria', { oldStatus: 'received', newStatus: 'repairing' });
      expect(msg.message).toContain('Maria');
      expect(msg.message).toContain('received');
      expect(msg.message).toContain('repairing');
    });

    it('uses Cliente when name is not provided', () => {
      const msg = buildMessage('REPAIR_CREATED', null, {});
      expect(msg.message).toContain('Cliente');
    });

    it('returns null for unknown event type', () => {
      const msg = buildMessage('UNKNOWN', 'Test', {});
      expect(msg).toBeNull();
    });
  });

  describe('buildWhatsAppMessage', () => {
    it('builds short WhatsApp message for CLIENT_CREATED', () => {
      const msg = buildWhatsAppMessage('CLIENT_CREATED', 'Juan', {});
      expect(msg).not.toBeNull();
      expect(msg.message).toContain('Juan');
      expect(msg.message).toContain('Tecno San Juan');
      expect(msg.message).not.toContain('{{name}}');
    });

    it('builds WhatsApp message for REPAIR_STATUS_CHANGED', () => {
      const msg = buildWhatsAppMessage('REPAIR_STATUS_CHANGED', 'Maria', { newStatus: 'reparando' });
      expect(msg.message).toContain('Maria');
      expect(msg.message).toContain('reparando');
      expect(msg.message).toContain('Tecno San Juan');
    });

    it('builds WhatsApp message for BUDGET_APPROVED', () => {
      const msg = buildWhatsAppMessage('BUDGET_APPROVED', 'Pedro', {});
      expect(msg.message).toContain('Pedro');
      expect(msg.message).toContain('aprobado');
    });

    it('builds WhatsApp message for BUDGET_REJECTED', () => {
      const msg = buildWhatsAppMessage('BUDGET_REJECTED', 'Ana', {});
      expect(msg.message).toContain('Ana');
      expect(msg.message).toContain('no fue aprobado');
    });

    it('builds WhatsApp message for PRINT_ORDER_CREATED', () => {
      const msg = buildWhatsAppMessage('PRINT_ORDER_CREATED', 'Luis', {});
      expect(msg.message).toContain('Luis');
      expect(msg.message).toContain('impresión 3D');
    });

    it('builds WhatsApp message for PRINT_ORDER_STATUS_CHANGED', () => {
      const msg = buildWhatsAppMessage('PRINT_ORDER_STATUS_CHANGED', 'Sofia', { newStatus: 'imprimiendo' });
      expect(msg.message).toContain('Sofia');
      expect(msg.message).toContain('imprimiendo');
    });

    it('WhatsApp messages are shorter than email equivalents', () => {
      const wa = buildWhatsAppMessage('REPAIR_CREATED', 'Juan', {});
      const email = buildMessage('REPAIR_CREATED', 'Juan', {});
      expect(wa.message.length).toBeLessThan(email.message.length);
    });

    it('uses Cliente when name is not provided', () => {
      const msg = buildWhatsAppMessage('REPAIR_CREATED', null, {});
      expect(msg.message).toContain('Cliente');
    });

    it('returns null for unknown event type', () => {
      const msg = buildWhatsAppMessage('UNKNOWN', 'Test', {});
      expect(msg).toBeNull();
    });

    it('WhatsApp message does not have subject field', () => {
      const msg = buildWhatsAppMessage('CLIENT_CREATED', 'Juan', {});
      expect(msg.subject).toBe('');
    });

    it('includes all metadata placeholders in WA template', () => {
      const msg = buildWhatsAppMessage('REPAIR_STATUS_CHANGED', 'Carlos', { oldStatus: 'diagnosing', newStatus: 'repairing' });
      expect(msg.message).toContain('repairing');
      expect(msg.message).not.toContain('diagnosing');
    });

    it('handles long client names in WhatsApp', () => {
      const longName = 'Juan Carlos María González del Valle';
      const msg = buildWhatsAppMessage('CLIENT_CREATED', longName, {});
      expect(msg.message).toContain(longName);
    });

    it('WhatsApp messages end with business signature', () => {
      const types = ['CLIENT_CREATED', 'REPAIR_CREATED', 'REPAIR_STATUS_CHANGED',
        'BUDGET_CREATED', 'BUDGET_APPROVED', 'BUDGET_REJECTED',
        'PRINT_ORDER_CREATED', 'PRINT_ORDER_STATUS_CHANGED'];
      for (const type of types) {
        const msg = buildWhatsAppMessage(type, 'Test', { newStatus: 'x', oldStatus: 'y' });
        expect(msg.message).toContain('Tecno San Juan');
      }
    });
  });
});
