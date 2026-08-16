export class EventWorker {
  #eventQueue;
  #handlers;

  constructor(options = {}) {
    this.#eventQueue = options.eventQueue;
    this.#handlers = options.handlers || {};
    if (!this.#eventQueue) throw new Error('EventWorker: eventQueue is required');
  }

  async processBatch(limit = 10) {
    const events = await this.#eventQueue.dequeue(limit);
    const results = [];

    for (const event of events) {
      const result = await this.processEvent(event);
      results.push(result);
    }

    return results;
  }

  async processEvent(event) {
    try {
      const handler = this.#handlers[event.type];
      if (!handler) {
        await this.#eventQueue.acknowledge(event.eventId);
        return { eventId: event.eventId, status: 'skipped', reason: 'no_handler' };
      }

      await handler(event);
      await this.#eventQueue.acknowledge(event.eventId);
      return { eventId: event.eventId, status: 'completed' };
    } catch (err) {
      await this.#eventQueue.reject(event.eventId, err.message);
      const maxed = event.attempts + 1 >= 3;
      return {
        eventId: event.eventId,
        status: maxed ? 'failed' : 'retrying',
        error: err.message,
        attempts: event.attempts + 1,
      };
    }
  }
}
