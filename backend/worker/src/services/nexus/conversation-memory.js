export class ConversationMemory {
  constructor(options = {}) {
    this.#memory = new Map();
    this.#summaries = new Map();
    this.#maxEntries = options.maxEntries || 10000;
    this.#pruneInterval = options.pruneInterval || 60000;
    this.#lastPrune = Date.now();
  }

  #memory;
  #summaries;
  #maxEntries;
  #pruneInterval;
  #lastPrune;

  #prune() {
    const now = Date.now();
    for (const [convId, conv] of this.#memory) {
      for (const [key, entry] of conv) {
        if (entry.ttlMs && (now - entry.timestamp > entry.ttlMs)) {
          conv.delete(key);
        }
      }
      if (conv.size === 0) this.#memory.delete(convId);
    }
  }

  #maybePrune() {
    if (Date.now() - this.#lastPrune > this.#pruneInterval) {
      this.#prune();
      this.#lastPrune = Date.now();
    }
  }

  #enforceMax() {
    let total = 0;
    for (const conv of this.#memory.values()) total += conv.size;
    if (total > this.#maxEntries) this.#prune();
  }

  remember(conversationId, key, value, ttlMs = null) {
    this.#maybePrune();
    if (!this.#memory.has(conversationId)) {
      this.#memory.set(conversationId, new Map());
    }
    const entry = { value, timestamp: Date.now(), ttlMs };
    this.#memory.get(conversationId).set(key, entry);
    this.#enforceMax();
  }

  recall(conversationId, key) {
    this.#maybePrune();
    const conv = this.#memory.get(conversationId);
    if (!conv) return undefined;
    const entry = conv.get(key);
    if (!entry) return undefined;
    if (entry.ttlMs && (Date.now() - entry.timestamp > entry.ttlMs)) {
      conv.delete(key);
      return undefined;
    }
    return entry.value;
  }

  forget(conversationId, key) {
    const conv = this.#memory.get(conversationId);
    if (conv) conv.delete(key);
  }

  getConversationMemory(conversationId) {
    this.#maybePrune();
    const conv = this.#memory.get(conversationId);
    if (!conv) return {};
    const result = {};
    for (const [key, entry] of conv) {
      if (!entry.ttlMs || (Date.now() - entry.timestamp <= entry.ttlMs)) {
        result[key] = entry.value;
      }
    }
    return result;
  }

  setSummary(conversationId, summary) {
    this.#summaries.set(conversationId, {
      summary,
      timestamp: Date.now(),
    });
  }

  getSummary(conversationId) {
    const entry = this.#summaries.get(conversationId);
    return entry ? entry.summary : null;
  }

  clearConversation(conversationId) {
    this.#memory.delete(conversationId);
    this.#summaries.delete(conversationId);
  }

  clear() {
    this.#memory.clear();
    this.#summaries.clear();
  }

  get conversationCount() {
    return this.#memory.size;
  }

  getAllKeys(conversationId) {
    const conv = this.#memory.get(conversationId);
    return conv ? Array.from(conv.keys()) : [];
  }
}
