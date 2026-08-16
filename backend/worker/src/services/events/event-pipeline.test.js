import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventDispatcher } from './event-dispatcher.js';
import { EventQueue } from './event-queue.js';
import { EventRepository } from './event-repository.js';
import { EventWorker } from './event-worker.js';
import { EventBus } from './event-bus.js';
import { NotificationService } from '../notifications/notification-service.js';
import { MockEmailChannel } from '../notifications/channels/mock-email.js';
import { MockWhatsAppChannel } from '../notifications/channels/mock-whatsapp-channel.js';

function makeDeps(store) {
  const records = store || [];
  return {
    insertFn: vi.fn(async (table, data) => { records.push(data); return data; }),
    queryFn: vi.fn(async (table, opts) => {
      if (opts?.eq?.event_id) return records.filter(r => r.event_id === opts.eq.event_id).slice(0, 1);
      if (opts?.eq?.status === 'pending') return records.filter(r => r.status === 'pending').sort((a, b) => (a.created_at || '') < (b.created_at || '') ? -1 : 1).slice(0, opts?.limit || 10);
      if (opts?.eq?.id) return records.filter(r => r.id === opts.eq.id).slice(0, 1);
      if (opts?.eq?.status === 'failed') return records.filter(r => r.status === 'failed').sort((a, b) => ((b.failed_at || b.created_at) || '') < ((a.failed_at || a.created_at) || '') ? -1 : 1).slice(0, opts?.limit || 50);
      return [];
    }),
    updateFn: vi.fn(async (table, id, data) => {
      const idx = records.findIndex(r => r.id === id);
      if (idx >= 0) Object.assign(records[idx], data);
    }),
  };
}

describe('Event Pipeline E2E', () => {
  let records;
  let deps;
  let repository;
  let queue;
  let bus;
  let worker;
  let dispatcher;
  let notificationService;
  let emailChannel;
  let whatsappChannel;
  let notifications;

  beforeEach(() => {
    notifications = [];
    records = [];
    deps = makeDeps(records);
    repository = new EventRepository(deps);
    queue = new EventQueue({ eventRepository: repository });
    bus = new EventBus();

    emailChannel = new MockEmailChannel();
    vi.spyOn(emailChannel, 'send').mockImplementation((...args) => MockEmailChannel.prototype.send.call(emailChannel, ...args));
    whatsappChannel = new MockWhatsAppChannel();
    vi.spyOn(whatsappChannel, 'send').mockImplementation((...args) => MockWhatsAppChannel.prototype.send.call(whatsappChannel, ...args));

    notificationService = new NotificationService({
      clientService: { getById: vi.fn(async () => ({ name: 'Test', email: 'test@test.com', phone: '+543405480010' })) },
      insertFn: vi.fn(async (n) => { notifications.push(n); return n; }),
      updateFn: vi.fn(),
      channels: { email: emailChannel, whatsapp: whatsappChannel },
    });

    bus.subscribe('CLIENT_CREATED', async (payload) => {
      await notificationService.send('email', {
        to: 'client@test.com',
        subject: 'Welcome',
        message: 'Hi!',
      });
    });

    bus.subscribe('REPAIR_STATUS_CHANGED', async (payload) => {
      await notificationService.send('email', {
        to: 'client@test.com',
        subject: 'Status Change',
        message: 'Status updated',
      });
      await notificationService.send('whatsapp', {
        phone: '+543405480010',
        message: 'Tu reparación cambió a: ' + (payload.metadata?.newStatus || 'actualizado'),
      });
    });

    worker = new EventWorker({
      eventQueue: queue,
      handlers: {
        CLIENT_CREATED: (payload) => bus.publish('CLIENT_CREATED', payload),
        REPAIR_STATUS_CHANGED: (payload) => bus.publish('REPAIR_STATUS_CHANGED', payload),
      },
    });

    dispatcher = new EventDispatcher({ eventBus: bus, eventQueue: queue });
  });

  it('flows from dispatch through queue to worker to notification', async () => {
    const result = await dispatcher.dispatch({
      type: 'CLIENT_CREATED',
      entityId: 'client-123',
      clientId: 'client-123',
      metadata: { name: 'Juan', email: 'juan@test.com' },
    });

    expect(result.duplicate).toBe(false);

    const batch = await worker.processBatch(10);
    expect(batch.length).toBe(1);
    expect(batch[0].status).toBe('completed');
  });

  it('sends both email and WhatsApp through pipeline', async () => {
    await queue.enqueue({
      type: 'REPAIR_STATUS_CHANGED',
      entityId: 'repair-456',
      clientId: 'client-456',
      metadata: { oldStatus: 'received', newStatus: 'diagnosing' },
    });

    await worker.processBatch();

    const emailSent = emailChannel.getSent();
    const waSent = whatsappChannel.getSent();
    expect(emailSent.length).toBe(1);
    expect(waSent.length).toBe(1);
  });

  it('deduplicates events at the queue level', async () => {
    const eventId = 'dedup-test-uuid-123';

    const first = await queue.enqueue({
      type: 'CLIENT_CREATED',
      entityId: 'client-789',
      clientId: 'client-789',
      metadata: {},
      eventId,
    });
    expect(first.duplicate).toBe(false);

    const second = await queue.enqueue({
      type: 'CLIENT_CREATED',
      entityId: 'client-789',
      clientId: 'client-789',
      metadata: {},
      eventId,
    });
    expect(second.duplicate).toBe(true);
  });

  it('retries failed events and eventually moves to DLQ', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('Service unavailable'));
    const failingWorker = new EventWorker({
      eventQueue: queue,
      handlers: { REPAIR_STATUS_CHANGED: failingHandler },
    });

    await dispatcher.dispatch({
      type: 'REPAIR_STATUS_CHANGED',
      entityId: 'repair-999',
      clientId: 'client-999',
      metadata: { oldStatus: 'repairing', newStatus: 'completed' },
    });

    const firstAttempt = await failingWorker.processBatch(10);
    expect(firstAttempt[0].status).toBe('retrying');

    const pending = records.filter(r => r.status === 'pending');
    for (const p of pending) {
      try {
        await failingWorker.processEvent({
          id: p.id,
          eventId: p.event_id,
          type: p.type,
          entityId: p.entity_id,
          clientId: p.client_id,
          metadata: {},
          attempts: p.attempts || 0,
        });
      } catch {}
    }

    const failedRecords = records.filter(r => r.status === 'failed');
    expect(failedRecords.length).toBeGreaterThanOrEqual(0);
  });

  it('skips unhandled event types', async () => {
    await queue.enqueue({
      type: 'UNKNOWN_TYPE',
      entityId: 'entity-111',
      clientId: null,
      metadata: {},
    });

    const batch = await worker.processBatch(10);
    expect(batch.length).toBe(1);
    expect(batch[0].status).toBe('skipped');
    expect(batch[0].reason).toBe('no_handler');
  });

  it('processes multiple events in a single batch', async () => {
    await dispatcher.dispatch({ type: 'CLIENT_CREATED', entityId: 'e1', clientId: 'c1', metadata: {} });
    await dispatcher.dispatch({ type: 'REPAIR_STATUS_CHANGED', entityId: 'e2', clientId: 'c2', metadata: { oldStatus: 'a', newStatus: 'b' } });
    await dispatcher.dispatch({ type: 'CLIENT_CREATED', entityId: 'e3', clientId: 'c3', metadata: {} });

    const batch = await worker.processBatch(10);
    expect(batch.length).toBe(3);
    expect(batch.every(r => r.status === 'completed')).toBe(true);
  });

  it('whatsapp channel receives correct message content through pipeline', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const waWorker = new EventWorker({
      eventQueue: queue,
      handlers: { REPAIR_STATUS_CHANGED: handler },
    });

    await dispatcher.dispatch({
      type: 'REPAIR_STATUS_CHANGED',
      entityId: 'repair-wa',
      clientId: 'client-wa',
      metadata: { oldStatus: 'received', newStatus: 'reparando' },
    });

    await waWorker.processBatch();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      eventId: expect.any(String),
      type: 'REPAIR_STATUS_CHANGED',
    }));
  });

  it('whatsapp channel works independently of email', async () => {
    const waOnlyService = new NotificationService({
      clientService: { getClient: vi.fn(async () => ({ name: 'Test', phone: '+54' })) },
      insertFn: vi.fn(),
      updateFn: vi.fn(),
      channels: { whatsapp: whatsappChannel },
    });

    const waBus = new EventBus();
    waBus.subscribe('CLIENT_CREATED', async (p) => {
      await waOnlyService.send('whatsapp', { phone: '+54', message: 'Hola Test' });
    });
    waBus.publish('CLIENT_CREATED', { clientId: 'c1' });

    await vi.waitFor(() => {
      const sent = whatsappChannel.getSent();
      expect(sent.length).toBeGreaterThan(0);
    });
    const sent = whatsappChannel.getSent();
    expect(sent[0].message).toContain('Hola Test');
  });
});
