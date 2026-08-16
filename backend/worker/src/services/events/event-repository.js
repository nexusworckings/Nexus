export class EventRepository {
  #insertFn;
  #queryFn;
  #updateFn;

  constructor(options = {}) {
    this.#insertFn = options.insertFn;
    this.#queryFn = options.queryFn;
    this.#updateFn = options.updateFn;
    if (!this.#insertFn) throw new Error('EventRepository: insertFn is required');
    if (!this.#queryFn) throw new Error('EventRepository: queryFn is required');
  }

  async create(event) {
    const entry = {
      id: event.id,
      event_id: event.eventId,
      type: event.type,
      entity_id: event.entityId || null,
      client_id: event.clientId || null,
      payload: JSON.stringify(event.metadata || {}),
      status: 'pending',
      attempts: 0,
    };
    await this.#insertFn('events', entry);
    return { ...entry, id: event.id };
  }

  async findByEventId(eventId) {
    try {
      const results = await this.#queryFn('events', { eq: { event_id: eventId }, limit: 1 });
      const list = Array.isArray(results) ? results : [];
      return list[0] || null;
    } catch {
      return null;
    }
  }

  async getPending(limit = 10) {
    try {
      const results = await this.#queryFn('events', {
        eq: { status: 'pending' },
        order: 'created_at.asc',
        limit,
      });
      return Array.isArray(results) ? results : [];
    } catch {
      return [];
    }
  }

  async markProcessing(id) {
    if (!this.#updateFn) return;
    try {
      await this.#updateFn('events', id, { status: 'processing' });
    } catch {
      // fail silently
    }
  }

  async markCompleted(id) {
    if (!this.#updateFn) return;
    try {
      await this.#updateFn('events', id, {
        status: 'completed',
        processed_at: new Date().toISOString(),
      });
    } catch {
      // fail silently
    }
  }

  async markFailed(id, error) {
    if (!this.#updateFn) return;
    try {
      await this.#updateFn('events', id, {
        status: 'failed',
        error_message: String(error),
      });
    } catch {
      // fail silently
    }
  }

  async incrementAttempts(id) {
    if (!this.#updateFn) return;
    try {
      const current = await this.#queryFn('events', { eq: { id }, limit: 1 });
      const list = Array.isArray(current) ? current : [];
      const ev = list[0];
      const newAttempts = (ev?.attempts || 0) + 1;
      await this.#updateFn('events', id, { attempts: newAttempts });
      return newAttempts;
    } catch {
      return 0;
    }
  }

  async getFailed(limit = 50) {
    try {
      const results = await this.#queryFn('events', {
        eq: { status: 'failed' },
        order: 'created_at.desc',
        limit,
      });
      return Array.isArray(results) ? results : [];
    } catch {
      return [];
    }
  }

  async moveToDlq(eventId, errorMessage) {
    try {
      const event = await this.findByEventId(eventId);
      if (!event) return null;
      const dlqEntry = {
        id: crypto.randomUUID(),
        event_id: event.event_id,
        type: event.type,
        entity_id: event.entity_id || null,
        client_id: event.client_id || null,
        payload: typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload || {}),
        attempts: event.attempts || 0,
        error_message: String(errorMessage),
        failed_at: new Date().toISOString(),
        status: 'failed',
      };
      await this.#insertFn('event_dlq', dlqEntry);
      return dlqEntry;
    } catch {
      return null;
    }
  }

  async getDlq(limit = 50) {
    try {
      const results = await this.#queryFn('event_dlq', {
        eq: { status: 'failed' },
        order: 'failed_at.desc',
        limit,
      });
      return Array.isArray(results) ? results : [];
    } catch {
      return [];
    }
  }

  async getDlqById(dlqId) {
    try {
      const results = await this.#queryFn('event_dlq', { eq: { id: dlqId }, limit: 1 });
      const list = Array.isArray(results) ? results : [];
      return list[0] || null;
    } catch {
      return null;
    }
  }

  async markDlqReplayed(dlqId) {
    if (!this.#updateFn) return;
    try {
      await this.#updateFn('event_dlq', dlqId, {
        status: 'replayed',
        replayed_at: new Date().toISOString(),
      });
    } catch {
      // fail silently
    }
  }

  async removeFromDlq(dlqId) {
    if (!this.#updateFn) return;
    try {
      await this.#updateFn('event_dlq', dlqId, { status: 'purged' });
    } catch {
      // fail silently
    }
  }
}
