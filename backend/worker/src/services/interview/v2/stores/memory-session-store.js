import { SessionStore } from '../session-store.js';
import { deepClone, deepFreeze } from '../utils.js';

export class MemorySessionStore extends SessionStore {
  #sessions;

  constructor() {
    super();
    this.#sessions = new Map();
  }

  create(sessionId, data) {
    this.#sessions.set(sessionId, {
      sessionId,
      state: data.state,
      schema: deepClone(data.schema),
      status: 'active',
    });
  }

  get(sessionId) {
    const entry = this.#sessions.get(sessionId);
    if (!entry) return undefined;
    return {
      sessionId,
      state: entry.state,
      schema: deepFreeze(deepClone(entry.schema)),
      status: entry.status || 'active',
    };
  }

  update(sessionId, data) {
    const entry = this.#sessions.get(sessionId);
    if (!entry) return false;
    if (data.state !== undefined) {
      entry.state = data.state;
    }
    if (data.schema !== undefined) {
      entry.schema = deepClone(data.schema);
    }
    return true;
  }

  delete(sessionId) {
    return this.#sessions.delete(sessionId);
  }

  markCompleted(sessionId) {
    const entry = this.#sessions.get(sessionId);
    if (!entry) return false;
    entry.status = 'completed';
    return true;
  }

  exists(sessionId) {
    return this.#sessions.has(sessionId);
  }
}
