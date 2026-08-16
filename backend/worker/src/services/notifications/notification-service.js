import { buildMessage, buildWhatsAppMessage } from './notification-template.js';

export class NotificationService {
  #clientService;
  #insertFn;
  #updateFn;
  #channels;

  constructor(options = {}) {
    this.#clientService = options.clientService;
    this.#insertFn = options.insertFn;
    this.#updateFn = options.updateFn;
    this.#channels = options.channels || {};
    if (!this.#clientService) throw new Error('NotificationService: clientService is required');
    if (!this.#insertFn) throw new Error('NotificationService: insertFn is required');
    if (!this.#channels.email && !this.#channels.whatsapp) {
      throw new Error('NotificationService: at least one channel (email or whatsapp) is required');
    }
  }

  subscribe(eventBus) {
    const types = [
      'CLIENT_CREATED', 'REPAIR_CREATED', 'REPAIR_STATUS_CHANGED',
      'BUDGET_CREATED', 'BUDGET_APPROVED', 'BUDGET_REJECTED',
      'PRINT_ORDER_CREATED', 'PRINT_ORDER_STATUS_CHANGED',
    ];
    for (const type of types) {
      eventBus.subscribe(type, (payload) => this.handleEvent(type, payload));
    }
  }

  async handleEvent(eventType, payload) {
    if (!payload) return;

    const clientId = payload.clientId;
    let clientName = 'Cliente';
    let clientPhone = null;
    let clientEmail = null;

    if (clientId) {
      try {
        const client = await this.#clientService.getClient(clientId);
        if (client) {
          clientName = client.name;
          clientPhone = client.phone || null;
          clientEmail = client.email || null;
        }
      } catch {
        // continue without client info
      }
    }

    const metadata = payload.metadata || {};

    const emailMsg = buildMessage(eventType, clientName, metadata);
    if (emailMsg) {
      const notification = await this.createNotification({
        clientId,
        type: eventType,
        channel: 'email',
        message: emailMsg.message,
      });
      await this.#sendWithChannel('email', {
        to: clientEmail || 'no-reply@tecnosanjuan.com',
        subject: emailMsg.subject,
        message: emailMsg.message,
      }, notification.id);
    }

    const waMsg = buildWhatsAppMessage(eventType, clientName, metadata);
    if (waMsg && clientPhone) {
      const notification = await this.createNotification({
        clientId,
        type: eventType,
        channel: 'whatsapp',
        message: waMsg.message,
      });
      await this.#sendWithChannel('whatsapp', {
        phone: clientPhone,
        message: waMsg.message,
        metadata: { eventType, ...metadata },
      }, notification.id);
    }
  }

  async #sendWithChannel(channelName, payload, notificationId) {
    const channel = this.#channels[channelName];
    if (!channel) {
      await this.#updateStatus(notificationId, 'failed');
      return;
    }
    try {
      await channel.send(payload);
      await this.#updateStatus(notificationId, 'sent');
    } catch {
      await this.#updateStatus(notificationId, 'failed');
    }
  }

  async send(channelName, payload) {
    const channel = this.#channels[channelName];
    if (!channel) throw new Error(`NotificationService: channel "${channelName}" not configured`);
    return channel.send(payload);
  }

  async createNotification(data) {
    const id = crypto.randomUUID();
    const entry = {
      id,
      client_id: data.clientId || null,
      type: data.type,
      channel: data.channel || 'email',
      status: data.status || 'pending',
      message: data.message || '',
    };

    await this.#insertFn('notifications', entry);
    return { id, ...entry };
  }

  async #updateStatus(id, status) {
    if (!this.#updateFn) return;
    try {
      await this.#updateFn('notifications', id, { status });
    } catch {
      // fail silently
    }
  }
}
