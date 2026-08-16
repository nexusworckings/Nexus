export class EventBus {
  #listeners;

  constructor() {
    this.#listeners = new Map();
  }

  subscribe(type, handler) {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }
    this.#listeners.get(type).add(handler);
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe(type, handler) {
    const handlers = this.#listeners.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.#listeners.delete(type);
      }
    }
  }

  publish(type, payload) {
    const handlers = this.#listeners.get(type);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        const result = handler(payload);
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      } catch {
        // Isolate errors — one listener never breaks others
      }
    }
  }
}

export const eventBus = new EventBus();
