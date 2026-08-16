import { describe, it, expect, vi } from 'vitest';
import { NotificationService } from './notification-service.js';
import { MockEmailChannel } from './channels/mock-email.js';
import { MockWhatsAppChannel } from './channels/mock-whatsapp-channel.js';
import { EventBus } from '../events/event-bus.js';

function makeDeps() {
  const clientService = {
    getClient: vi.fn(),
  };
  return {
    clientService,
    insertFn: vi.fn(async (table, data) => ({ ...data, id: data.id || 'mock-uuid' })),
    updateFn: vi.fn(),
    channels: {
      email: new MockEmailChannel(),
      whatsapp: new MockWhatsAppChannel(),
    },
  };
}

function makeService(deps) {
  return new NotificationService(deps || makeDeps());
}

describe('NotificationService', () => {
  describe('constructor', () => {
    it('rejects missing clientService', () => {
      expect(() => new NotificationService({ insertFn: async () => {}, channels: { email: {} } })).toThrow('clientService is required');
    });

    it('rejects missing insertFn', () => {
      expect(() => new NotificationService({ clientService: {}, channels: { email: {} } })).toThrow('insertFn is required');
    });

    it('rejects missing both channels', () => {
      expect(() => new NotificationService({ clientService: {}, insertFn: async () => {}, channels: {} })).toThrow('at least one channel');
    });

    it('accepts only email channel', () => {
      const svc = new NotificationService({ clientService: { getClient: vi.fn() }, insertFn: async () => {}, channels: { email: {} } });
      expect(svc).toBeInstanceOf(NotificationService);
    });

    it('accepts only whatsapp channel', () => {
      const svc = new NotificationService({ clientService: { getClient: vi.fn() }, insertFn: async () => {}, channels: { whatsapp: {} } });
      expect(svc).toBeInstanceOf(NotificationService);
    });

    it('accepts both channels', () => {
      const svc = new NotificationService({ clientService: { getClient: vi.fn() }, insertFn: async () => {}, channels: { email: {}, whatsapp: {} } });
      expect(svc).toBeInstanceOf(NotificationService);
    });
  });

  describe('createNotification', () => {
    it('creates notification record', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      const result = await svc.createNotification({
        clientId: 'client-1',
        type: 'REPAIR_CREATED',
        channel: 'email',
        message: 'Test message',
      });

      expect(result.id).toBeTruthy();
      expect(result.client_id).toBe('client-1');
      expect(result.type).toBe('REPAIR_CREATED');
      expect(result.status).toBe('pending');
      expect(deps.insertFn).toHaveBeenCalledWith('notifications', expect.objectContaining({
        client_id: 'client-1',
        type: 'REPAIR_CREATED',
      }));
    });

    it('defaults status to pending', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      const result = await svc.createNotification({
        clientId: 'c1',
        type: 'TEST',
        message: 'msg',
      });

      expect(result.status).toBe('pending');
    });

    it('defaults channel to email', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      const result = await svc.createNotification({
        clientId: 'c1',
        type: 'TEST',
        message: 'msg',
      });

      expect(result.channel).toBe('email');
    });

    it('uses specified channel', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      const result = await svc.createNotification({
        clientId: 'c1',
        type: 'TEST',
        channel: 'whatsapp',
        message: 'msg',
      });

      expect(result.channel).toBe('whatsapp');
    });
  });

  describe('handleEvent', () => {
    it('does nothing for unknown event type', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      await svc.handleEvent('UNKNOWN_TYPE', { clientId: 'c1' });

      expect(deps.insertFn).not.toHaveBeenCalled();
    });

    it('does nothing for null payload', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_CREATED', null);

      expect(deps.insertFn).not.toHaveBeenCalled();
    });

    it('sends email for REPAIR_CREATED when client has email', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Juan', email: 'juan@test.com' });
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_CREATED', {
        clientId: 'c1',
        entityId: 'r1',
        metadata: { device: 'Samsung' },
      });

      const sent = deps.channels.email.getSent();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe('juan@test.com');
      expect(sent[0].subject).toBe('Reparación recibida');
      expect(sent[0].message).toContain('Juan');
    });

    it('does not send WhatsApp when client has no phone', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Juan', email: 'juan@test.com' });
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_CREATED', {
        clientId: 'c1',
        entityId: 'r1',
      });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(0);
    });

    it('sends WhatsApp when client has phone', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Juan', email: 'juan@test.com', phone: '+543405480010' });
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_CREATED', {
        clientId: 'c1',
        entityId: 'r1',
      });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(1);
      expect(waSent[0].phone).toBe('+543405480010');
      expect(waSent[0].message).toContain('Juan');
      expect(waSent[0].message).toContain('Recibimos tu equipo');
    });

    it('sends both email and WhatsApp when client has both', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Maria', email: 'maria@test.com', phone: '+543405480011' });
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_STATUS_CHANGED', {
        clientId: 'c1',
        entityId: 'r1',
        metadata: { oldStatus: 'received', newStatus: 'repairing' },
      });

      const emailSent = deps.channels.email.getSent();
      const waSent = deps.channels.whatsapp.getSent();
      expect(emailSent.length).toBe(1);
      expect(waSent.length).toBe(1);
      expect(emailSent[0].message).toContain('received');
      expect(emailSent[0].message).toContain('repairing');
      expect(waSent[0].message).toContain('repairing');
    });

    it('updates status to sent on email success', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Test' });
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_CREATED', { clientId: 'c1', entityId: 'r1' });

      expect(deps.updateFn).toHaveBeenCalledWith('notifications', expect.any(String), { status: 'sent' });
    });

    it('updates status to failed when email channel throws', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Test' });
      deps.channels.email.send = vi.fn().mockRejectedValue(new Error('Send error'));
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_CREATED', { clientId: 'c1', entityId: 'r1' });

      expect(deps.updateFn).toHaveBeenCalledWith('notifications', expect.any(String), { status: 'failed' });
    });

    it('sends WhatsApp status change with newStatus', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Pedro', phone: '+54' });
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_STATUS_CHANGED', {
        clientId: 'c1',
        entityId: 'r1',
        metadata: { oldStatus: 'diagnosing', newStatus: 'repairing' },
      });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent[0].message).toContain('Pedro');
      expect(waSent[0].message).toContain('repairing');
    });

    it('sends WhatsApp for budget approved', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Ana', phone: '+54' });
      const svc = makeService(deps);

      await svc.handleEvent('BUDGET_APPROVED', { clientId: 'c1', entityId: 'b1' });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(1);
      expect(waSent[0].message).toContain('aprobado');
    });

    it('sends WhatsApp for budget rejected', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Luis', phone: '+54' });
      const svc = makeService(deps);

      await svc.handleEvent('BUDGET_REJECTED', { clientId: 'c1', entityId: 'b1' });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(1);
      expect(waSent[0].message).toContain('no fue aprobado');
    });
  });

  describe('whatsapp edge cases', () => {
    it('does not send WhatsApp when phone is null', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Juan', email: 'juan@test.com', phone: null });
      const svc = makeService(deps);

      await svc.handleEvent('REPAIR_CREATED', { clientId: 'c1', entityId: 'r1' });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(0);
    });

    it('sends WhatsApp for CLIENT_CREATED with phone', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Sofia', phone: '+54' });
      const svc = makeService(deps);

      await svc.handleEvent('CLIENT_CREATED', { clientId: 'c1', entityId: 'c1' });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(1);
      expect(waSent[0].message).toContain('Sofia');
      expect(waSent[0].message).toContain('registrados');
    });

    it('sends WhatsApp for PRINT_ORDER_CREATED', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Luis', phone: '+54' });
      const svc = makeService(deps);

      await svc.handleEvent('PRINT_ORDER_CREATED', { clientId: 'c1', entityId: 'p1' });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(1);
    });

    it('sends WhatsApp for PRINT_ORDER_STATUS_CHANGED', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Ana', phone: '+54' });
      const svc = makeService(deps);

      await svc.handleEvent('PRINT_ORDER_STATUS_CHANGED', { clientId: 'c1', entityId: 'p1', metadata: { newStatus: 'imprimiendo' } });

      const waSent = deps.channels.whatsapp.getSent();
      expect(waSent.length).toBe(1);
      expect(waSent[0].message).toContain('imprimiendo');
    });

    it('WhatsApp notification record has correct channel', async () => {
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Test', phone: '+54' });
      const svc = makeService(deps);

      await svc.handleEvent('CLIENT_CREATED', { clientId: 'c1', entityId: 'c1' });

      const calls = deps.insertFn.mock.calls;
      const waCalls = calls.filter(c => c[1] && c[1].channel === 'whatsapp');
      expect(waCalls.length).toBe(1);
      expect(waCalls[0][1].type).toBe('CLIENT_CREATED');
    });
  });

  describe('send', () => {
    it('sends via email channel', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      await svc.send('email', { to: 'test@test.com', subject: 'Test', message: 'Hello' });
      const sent = deps.channels.email.getSent();
      expect(sent.length).toBe(1);
      expect(sent[0].to).toBe('test@test.com');
    });

    it('sends via whatsapp channel', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      await svc.send('whatsapp', { phone: '+54', message: 'Hello' });
      const sent = deps.channels.whatsapp.getSent();
      expect(sent.length).toBe(1);
      expect(sent[0].phone).toBe('+54');
    });

    it('throws for unknown channel', async () => {
      const deps = makeDeps();
      const svc = makeService(deps);

      await expect(svc.send('sms', { message: 'Test' })).rejects.toThrow('channel "sms" not configured');
    });
  });

  describe('subscribe', () => {
    it('subscribes to all event types', () => {
      const bus = new EventBus();
      const subscribeSpy = vi.spyOn(bus, 'subscribe');
      const deps = makeDeps();
      const svc = makeService(deps);

      svc.subscribe(bus);

      expect(subscribeSpy).toHaveBeenCalledTimes(8);
      expect(subscribeSpy).toHaveBeenCalledWith('CLIENT_CREATED', expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith('REPAIR_CREATED', expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith('REPAIR_STATUS_CHANGED', expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith('BUDGET_CREATED', expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith('BUDGET_APPROVED', expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith('BUDGET_REJECTED', expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith('PRINT_ORDER_CREATED', expect.any(Function));
      expect(subscribeSpy).toHaveBeenCalledWith('PRINT_ORDER_STATUS_CHANGED', expect.any(Function));
    });

    it('triggers handleEvent when event is published', async () => {
      const bus = new EventBus();
      const deps = makeDeps();
      deps.clientService.getClient.mockResolvedValue({ id: 'c1', name: 'Test' });
      const svc = makeService(deps);
      svc.subscribe(bus);

      bus.publish('REPAIR_CREATED', { clientId: 'c1', entityId: 'r1', metadata: {} });

      await vi.waitFor(() => {
        expect(deps.insertFn).toHaveBeenCalledWith('notifications', expect.any(Object));
      });
    });
  });
});
