import { eventBus } from './event-bus.js';

export class EventDispatcher {
  #eventBus;
  #eventQueue;

  constructor(options = {}) {
    this.#eventBus = options.eventBus || eventBus;
    this.#eventQueue = options.eventQueue || null;
  }

  async dispatch(event) {
    if (!event || !event.type) {
      throw new Error('INVALID_EVENT: type is required');
    }
    if (!event.entityId) {
      throw new Error('INVALID_EVENT: entityId is required');
    }

    const payload = {
      entityId: event.entityId,
      clientId: event.clientId || null,
      metadata: event.metadata || {},
    };

    if (this.#eventBus) {
      this.#eventBus.publish(event.type, payload);
    }

    if (this.#eventQueue) {
      return this.#eventQueue.enqueue({
        type: event.type,
        entityId: event.entityId,
        clientId: event.clientId || null,
        metadata: event.metadata || {},
      });
    }
  }
}
