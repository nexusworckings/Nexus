const MAX_RETRIES = 3;

export class EventQueue {
  #repository;

  constructor(options = {}) {
    this.#repository = options.eventRepository;
    if (!this.#repository) throw new Error('EventQueue: eventRepository is required');
  }

  async enqueue(event) {
    if (!event || !event.type) {
      throw new Error('INVALID_EVENT: type is required');
    }
    if (!event.entityId) {
      throw new Error('INVALID_EVENT: entityId is required');
    }

    const eventId = event.eventId || crypto.randomUUID();

    const existing = await this.#repository.findByEventId(eventId);
    if (existing) {
      return { duplicate: true, existingId: existing.id };
    }

    const entry = {
      id: crypto.randomUUID(),
      eventId,
      type: event.type,
      entityId: event.entityId,
      clientId: event.clientId || null,
      metadata: event.metadata || {},
    };

    await this.#repository.create(entry);
    return { duplicate: false, id: entry.id, eventId };
  }

  async dequeue(limit = 10) {
    const events = await this.#repository.getPending(limit);
    for (const ev of events) {
      await this.#repository.markProcessing(ev.id);
    }
    return events.map(ev => ({
      id: ev.id,
      eventId: ev.event_id,
      type: ev.type,
      entityId: ev.entity_id,
      clientId: ev.client_id,
      metadata: this.#parsePayload(ev.payload),
      attempts: ev.attempts || 0,
    }));
  }

  async acknowledge(eventId) {
    const event = await this.#repository.findByEventId(eventId);
    if (event) {
      await this.#repository.markCompleted(event.id);
    }
  }

  async reject(eventId, error) {
    const event = await this.#repository.findByEventId(eventId);
    if (!event) return;

    const newAttempts = await this.#repository.incrementAttempts(event.id);

    if (newAttempts >= MAX_RETRIES) {
      await this.#repository.markFailed(event.id, error);
      await this.#repository.moveToDlq(eventId, error);
    } else {
      await this.#repository.markCompleted(event.id);
      await this.#requeue(event, newAttempts);
    }
  }

  async #requeue(event, attempts) {
    const newId = crypto.randomUUID();
    await this.#repository.create({
      id: newId,
      eventId: event.event_id,
      type: event.type,
      entityId: event.entity_id,
      clientId: event.client_id,
      metadata: typeof event.payload === 'string' ? JSON.parse(event.payload) : (event.payload || {}),
      attempts,
    });
  }

  async replay(eventId) {
    const event = await this.#repository.findByEventId(eventId);
    if (!event) return null;
    if (event.status !== 'failed') return null;

    const newEventId = crypto.randomUUID();
    const newId = crypto.randomUUID();
    const baseMetadata = this.#parsePayload(event.payload);
    await this.#repository.create({
      id: newId,
      eventId: newEventId,
      type: event.type,
      entityId: event.entity_id,
      clientId: event.client_id,
      metadata: { ...baseMetadata, replayedFrom: event.event_id },
      attempts: 0,
    });
    return { id: newId, eventId: newEventId, replayedFrom: event.event_id };
  }

  async replayFromDlq(dlqEntry) {
    const newEventId = crypto.randomUUID();
    const newId = crypto.randomUUID();
    const baseMetadata = this.#parsePayload(dlqEntry.payload);
    await this.#repository.create({
      id: newId,
      eventId: newEventId,
      type: dlqEntry.type,
      entityId: dlqEntry.entity_id,
      clientId: dlqEntry.client_id,
      metadata: { ...baseMetadata, replayedFrom: dlqEntry.event_id },
      attempts: 0,
    });
    await this.#repository.markDlqReplayed(dlqEntry.id);
    return { id: newId, eventId: newEventId, replayedFrom: dlqEntry.event_id };
  }

  async getDlq(limit = 50) {
    return this.#repository.getDlq(limit);
  }

  async getDlqById(dlqId) {
    return this.#repository.getDlqById(dlqId);
  }

  async removeFromDlq(dlqId) {
    return this.#repository.removeFromDlq(dlqId);
  }

  #parsePayload(payload) {
    if (!payload) return {};
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch { return {}; }
    }
    return payload;
  }
}
